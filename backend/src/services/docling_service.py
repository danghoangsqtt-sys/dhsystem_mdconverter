import os
import logging
import threading

from ..config import settings

from docling.document_converter import DocumentConverter, PdfFormatOption, WordFormatOption, ImageFormatOption
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode, EasyOcrOptions

from .markdown_cleaner import clean_markdown

# Set up simple logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────
# OCR language presets exposed to the frontend. EasyOCR needs explicit
# language codes (no "auto-detect"), so we offer a small fixed menu rather
# than a free-text field. "vi_en" (the original hardcoded behavior) stays
# the default — it's the safest choice for mixed-language documents.
# ──────────────────────────────────────────────────────────────
OCR_LANG_PRESETS: dict[str, list[str]] = {
    "vi_en": ["vi", "en"],
    "vi": ["vi"],
    "en": ["en"],
}
DEFAULT_OCR_LANG = "vi_en"

# TableFormerMode.ACCURATE: better handling of merged cells, multi-row
# headers, complex table structures — but ~2-3x slower than FAST. Exposed
# as a user choice since not every document needs the accuracy trade-off.
TABLE_MODES: dict[str, "TableFormerMode"] = {
    "accurate": TableFormerMode.ACCURATE,
    "fast": TableFormerMode.FAST,
}
DEFAULT_TABLE_MODE = "accurate"

# Each (lang, table_mode) combination needs its own DocumentConverter,
# since docling binds OCR language and table-recognition mode into the
# pipeline at construction time (no per-call override exists). Building all
# combinations eagerly would hold several full ML pipelines in memory at
# once, so instead each is built lazily on first use and cached — only the
# default combination is warmed up eagerly at startup (see warm_up_models).
_converter_cache: dict[tuple[str, str], DocumentConverter] = {}
_cache_lock = threading.Lock()
_conversion_lock = threading.Lock()


def _build_converter(lang_key: str, table_mode_key: str) -> DocumentConverter:
    pipeline_options = PdfPipelineOptions()
    pipeline_options.enable_remote_services = False
    if settings.docling_artifacts_path is not None:
        if not settings.docling_artifacts_path.is_dir():
            raise FileNotFoundError(
                f"Docling artifacts directory not found: {settings.docling_artifacts_path}"
            )
        pipeline_options.artifacts_path = settings.docling_artifacts_path
    elif settings.offline_mode:
        raise RuntimeError(
            "DOCUMARK_OFFLINE_MODE requires DOCLING_ARTIFACTS_PATH with pre-downloaded models."
        )
    pipeline_options.do_table_structure = True
    pipeline_options.table_structure_options.mode = TABLE_MODES[table_mode_key]
    pipeline_options.table_structure_options.do_cell_matching = True
    pipeline_options.ocr_options = EasyOcrOptions(
        lang=OCR_LANG_PRESETS[lang_key],
        download_enabled=not settings.offline_mode,
    )
    # Recognizes math/physics/chemistry formulas and source code blocks as
    # LaTeX/text instead of leaving them as unreadable OCR fragments or
    # rasterized picture items — needed for scientific/technical documents.
    # Uses the local CodeFormulaV2 model (bundled offline, no remote calls).
    pipeline_options.do_formula_enrichment = True
    pipeline_options.do_code_enrichment = True

    return DocumentConverter(
        format_options={
            # PDF: ML-based table recognition — needs explicit ACCURATE/FAST config.
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
            # DOCX: SimplePipeline + MsWordDocumentBackend reads OOXML directly.
            # No ML table-structure options exist for this pipeline; native XML
            # parsing already preserves the table layout from the Word file.
            InputFormat.DOCX: WordFormatOption(),
            # IMAGE: standalone images (e.g. a cropped region exported from the
            # PDF viewer's region-extraction tool) go through the same
            # StandardPdfPipeline as PDF pages, so they need the same OCR
            # language config to read Vietnamese/English text correctly.
            InputFormat.IMAGE: ImageFormatOption(pipeline_options=pipeline_options),
        }
    )


def get_converter(lang_key: str = DEFAULT_OCR_LANG, table_mode_key: str = DEFAULT_TABLE_MODE) -> DocumentConverter:
    """
    Returns a cached DocumentConverter for the given (language, table mode)
    combination, building and warming it up on first use. Unknown keys
    silently fall back to the default combination instead of erroring, since
    the caller is request input that shouldn't be able to 500 the endpoint.
    """
    if lang_key not in OCR_LANG_PRESETS:
        lang_key = DEFAULT_OCR_LANG
    if table_mode_key not in TABLE_MODES:
        table_mode_key = DEFAULT_TABLE_MODE

    cache_key = (lang_key, table_mode_key)
    with _cache_lock:
        converter = _converter_cache.get(cache_key)
        if converter is None:
            logger.info(f"Building DocumentConverter for lang={lang_key}, table_mode={table_mode_key}...")
            converter = _build_converter(lang_key, table_mode_key)
            converter.initialize_pipeline(InputFormat.PDF)
            converter.initialize_pipeline(InputFormat.DOCX)
            _converter_cache[cache_key] = converter
    return converter


# Mutated in place (never reassigned) so other modules that imported this
# dict by reference — e.g. main.py's /api/health — observe updates live.
startup_state = {"status": "starting", "detail": "Đang khởi động..."}


def warm_up_models() -> None:
    """
    Eagerly builds the default (lang, table_mode) pipeline so its ML models
    (layout, table structure, EasyOCR) are loaded/downloaded once at startup
    instead of silently blocking a user's first conversion request. Other
    presets are built lazily on first use (see get_converter). Meant to be
    run on a background thread; updates `startup_state` as it progresses so
    a client (e.g. the Electron shell) can poll and display real progress.
    """
    try:
        startup_state["status"] = "loading_models"
        startup_state["detail"] = "Đang tải mô hình AI (lần đầu có thể mất vài phút)..."
        get_converter(DEFAULT_OCR_LANG, DEFAULT_TABLE_MODE)
        startup_state["status"] = "ready"
        startup_state["detail"] = "Sẵn sàng."
        logger.info("Model warm-up complete; backend ready.")
    except Exception as e:
        import traceback
        logger.error(f"Model warm-up failed: {e}\n{traceback.format_exc()}")
        startup_state["status"] = "error"
        startup_state["detail"] = f"Lỗi tải mô hình: {e}"


def convert_document_to_markdown(
    file_path: str,
    lang: str = DEFAULT_OCR_LANG,
    table_mode: str = DEFAULT_TABLE_MODE,
) -> str:
    """
    Converts a document (PDF, DOCX, etc.) to Markdown using docling.
    Retains formatting, layout, tables, math/physics/chemistry formulas (as
    LaTeX), and source code blocks according to docling's capabilities.
    Post-processes the output with markdown_cleaner for better readability.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    try:
        converter = get_converter(lang, table_mode)

        import pathlib
        resolved_path = pathlib.Path(file_path).resolve()
        logger.info(f"Starting conversion for: {resolved_path} (lang={lang}, table_mode={table_mode})")
        # DocumentConverter pipelines hold native/ML state and are not treated
        # as thread-safe. The API job queue is also single-worker, but this lock
        # protects direct library callers and startup/request overlap.
        with _conversion_lock:
            result = converter.convert(resolved_path)

        # Export the document model to markdown
        raw_markdown = result.document.export_to_markdown()
        logger.info(f"Raw conversion complete: {resolved_path}")

        # Post-process: clean up tables, remove empty columns, etc.
        cleaned_markdown = clean_markdown(raw_markdown)
        logger.info(f"Post-processing complete: {file_path}")

        return cleaned_markdown
    except Exception as e:
        import traceback
        logger.error(f"Error during document conversion: {e}\n{traceback.format_exc()}")
        raise
