from __future__ import annotations

import gc
import os
import logging
import threading
import tempfile
from pathlib import Path
from typing import Any

from PIL import Image

from ...config import settings

from .markdown_cleaner import clean_markdown
from ..shared.easyocr_reader import DEFAULT_OCR_LANG, OCR_LANG_PRESETS, get_region_reader
from ..shared.resource_scheduler import heavy_job_slot

# Set up simple logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# TableFormerMode.ACCURATE: better handling of merged cells, multi-row
# headers, complex table structures — but ~2-3x slower than FAST. Exposed
# as a user choice since not every document needs the accuracy trade-off.
TABLE_MODES = {"accurate", "fast"}
DEFAULT_TABLE_MODE = "accurate"

# Docling's AcceleratorOptions.num_threads defaults to a hardcoded 4
# regardless of machine size. Use most of the available CPU cores instead,
# leaving a couple free so the backend/UI stay responsive during a
# conversion (heavy_job_slot already limits this to one job at a time, so
# there's no risk of multiple conversions competing for the same cores).
_cpu_count = os.cpu_count() or 4
ACCELERATOR_NUM_THREADS = max(4, min(_cpu_count - 2, 16))

# Large scanned PDFs can make the native PDF preprocessing stage retain too
# many page bitmaps at once.  Keep both Docling's internal inference batches
# and our page ranges bounded.  Failed ranges are split recursively below, so
# this is a performance knob rather than a correctness limit.
# Increased from 8 to 16 to better utilize batch sizes above.
PDF_CHUNK_SIZE = 16
PDF_FALLBACK_MAX_DIMENSION = 2200

# Each (lang, table_mode) combination needs its own DocumentConverter,
# since docling binds OCR language and table-recognition mode into the
# pipeline at construction time (no per-call override exists). Building all
# combinations eagerly would hold several full ML pipelines in memory at
# once, so instead each is built lazily on first use and cached — only the
# default combination is warmed up eagerly at startup (see warm_up_models).
_converter_cache: dict[tuple[str, str], Any] = {}
_cache_lock = threading.Lock()


def _build_converter(lang_key: str, table_mode_key: str) -> Any:
    # Docling imports Torch and its native ML stack.  Importing it at module
    # load used to delay Uvicorn from opening the health endpoint for more
    # than 90 seconds on a cold packaged start.  Keep the import behind the
    # background warm-up/first-conversion boundary so the desktop shell can
    # attach to Tini Core immediately and display real model-loading progress.
    from docling.document_converter import DocumentConverter, PdfFormatOption, WordFormatOption
    from docling.datamodel.accelerator_options import AcceleratorDevice, AcceleratorOptions
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import EasyOcrOptions, PdfPipelineOptions, TableFormerMode

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
    pipeline_options.table_structure_options.mode = (
        TableFormerMode.ACCURATE if table_mode_key == "accurate" else TableFormerMode.FAST
    )
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
    # Needed so picture/diagram bitmaps are retained during the single Docling
    # pass and can be embedded in exported Markdown/Word — without this,
    # export_to_markdown() has no image data to embed regardless of image_mode.
    # 2.0 ~= 144 DPI for picture crops (not full pages), a modest per-document
    # cost compared to a full page raster.
    pipeline_options.generate_picture_images = True
    pipeline_options.images_scale = 2.0
# Increased from 1 to improve throughput on modern CPUs (4+ cores).
    # Memory stays bounded because PDF_CHUNK_SIZE limits concurrent pages.
    # Tuned for typical Windows machines with 8-16GB RAM.
    pipeline_options.layout_batch_size = 4
    pipeline_options.ocr_batch_size = 4
    pipeline_options.table_batch_size = 2
    pipeline_options.accelerator_options = AcceleratorOptions(
        device=AcceleratorDevice.AUTO,
        num_threads=ACCELERATOR_NUM_THREADS,
    )

    return DocumentConverter(
        format_options={
            # PDF: ML-based table recognition — needs explicit ACCURATE/FAST config.
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
            # DOCX: SimplePipeline + MsWordDocumentBackend reads OOXML directly.
            # No ML table-structure options exist for this pipeline; native XML
            # parsing already preserves the table layout from the Word file.
            InputFormat.DOCX: WordFormatOption(),
        }
    )


def get_converter(lang_key: str = DEFAULT_OCR_LANG, table_mode_key: str = DEFAULT_TABLE_MODE) -> Any:
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
            from docling.datamodel.base_models import InputFormat

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
        # Pre-warm region OCR reader for faster first region extraction
        get_region_reader(DEFAULT_OCR_LANG)
        startup_state["status"] = "ready"
        startup_state["detail"] = "Sẵn sàng."
        logger.info("Model warm-up complete; backend ready.")
    except Exception as e:
        import traceback
        logger.error(f"Model warm-up failed: {e}\n{traceback.format_exc()}")
        startup_state["status"] = "error"
        startup_state["detail"] = f"Lỗi tải mô hình: {e}"


def upscale_region_image(file_path: str, min_width: int = 600) -> str:
    """
    Upscale cropped region images (from PDF viewer extraction) to improve OCR
    accuracy. Small/sparse crops often fail Docling's layout classification
    and EasyOCR confidence, so we upscale 2x–4x before conversion if the image
    is smaller than min_width pixels.

    Args:
        file_path: Path to the original region image (PNG)
        min_width: Upscale if image width < this value (default 600)

    Returns:
        Path to upscaled image (original file if already large enough, or
        a new temp file with 2x-4x scaling)
    """
    try:
        img = Image.open(file_path)
        width, height = img.size
        
        # Only upscale small images; large ones already have good resolution
        if width >= min_width:
            logger.info(f"Region image already large ({width}x{height}), skipping upscale")
            return file_path
        
        # Calculate upscale factor (2x–4x depending on how small)
        # Small images need more aggressive upscaling to improve OCR
        if width < 250:
            scale = 4      # Very small: 4x
        elif width < 350:
            scale = 3.5    # Tiny: 3.5x
        elif width < 500:
            scale = 3      # Small: 3x
        else:
            scale = 2
        
        new_width = int(width * scale)
        new_height = int(height * scale)
        
        logger.info(f"Upscaling region image {width}x{height} → {new_width}x{new_height} ({scale}x)")
        
        # LANCZOS resampling: highest quality for upscaling
        upscaled = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        # Save to a temp file (Docling needs a file path, not bytes)
        temp_file = Path(tempfile.gettempdir()) / f"region_upscaled_{Path(file_path).stem}.png"
        upscaled.save(temp_file, format="PNG", optimize=False)
        
        logger.info(f"Upscaled region saved to {temp_file}")
        return str(temp_file)
    
    except Exception as e:
        logger.warning(f"Failed to upscale region image {file_path}: {e}, using original")
        return file_path


class IncompleteDocumentConversionError(RuntimeError):
    """Raised when Docling could not account for every requested page."""


def _extract_region_text(image_path: Path, lang_key: str) -> str:
    """OCR every pixel in a user-selected crop without layout filtering.

    Docling's document pipeline is intentionally conservative and can discard
    small bullet lines as low-confidence layout noise.  A crop is explicit
    user intent, so use EasyOCR directly with permissive detection thresholds
    and preserve every recognized line for review/editing in the UI.
    """
    reader = get_region_reader(lang_key)
    lines = reader.readtext(
        str(image_path),
        detail=0,
        paragraph=False,
        decoder="beamsearch",
        canvas_size=3200,
        mag_ratio=2.0,
        text_threshold=0.3,
        low_text=0.2,
        link_threshold=0.2,
    )
    text = "\n".join(str(line).strip() for line in lines if str(line).strip())
    logger.info("Direct region OCR extracted %s non-empty lines", len(text.splitlines()))
    return text


def _conversion_error_summary(result: Any) -> str:
    errors = getattr(result, "errors", None) or []
    messages = [str(getattr(item, "error_message", item)).strip() for item in errors]
    return "; ".join(message for message in messages if message) or "unknown Docling error"


def _is_complete_result(result: Any, expected_pages: int | None = None) -> bool:
    from docling.datamodel.base_models import ConversionStatus

    if getattr(result, "status", None) != ConversionStatus.SUCCESS:
        return False
    if expected_pages is None:
        return True
    pages = getattr(result, "pages", None)
    return pages is not None and len(pages) == expected_pages


def _export_result(result: Any) -> str:
    from docling.datamodel.base_models import InputFormat
    from docling_core.types.doc import ImageRefMode

    if result.input.format == InputFormat.IMAGE:
        # Image inputs are user-selected OCR regions or raster fallbacks for a
        # problematic PDF page.  Reading text items directly avoids Docling's
        # occasional misclassification of a whole image as a Picture block.
        return "\n\n".join(
            item.text.strip()
            for item in result.document.texts
            if item.text and item.text.strip()
        )
    # EMBEDDED inlines each picture/diagram as a base64 data URI directly in
    # the Markdown string, instead of the default PLACEHOLDER (`<!-- image -->`).
    # Keeps the document a single self-contained string, matching how job
    # storage/history/autosave/editor already treat it — no sibling image
    # folder to invent and thread through those systems.
    return result.document.export_to_markdown(image_mode=ImageRefMode.EMBEDDED)


def _get_pdf_page_count(file_path: Path) -> int:
    import pypdfium2 as pdfium

    document = pdfium.PdfDocument(str(file_path))
    try:
        return len(document)
    finally:
        document.close()


def _render_pdf_page_to_image(file_path: Path, page_number: int, output_path: Path) -> None:
    """Rasterize one 1-based PDF page with a strict pixel-size ceiling."""
    import pypdfium2 as pdfium

    document = pdfium.PdfDocument(str(file_path))
    page = None
    bitmap = None
    try:
        page = document[page_number - 1]
        width, height = page.get_size()
        longest_edge = max(width, height, 1)
        scale = max(0.05, min(2.0, PDF_FALLBACK_MAX_DIMENSION / longest_edge))
        bitmap = page.render(scale=scale)
        bitmap.to_pil().convert("RGB").save(output_path, format="PNG", optimize=False)
    finally:
        if bitmap is not None:
            bitmap.close()
        if page is not None:
            page.close()
        document.close()


def _convert_rasterized_pdf_page(
    converter: Any,
    file_path: Path,
    page_number: int,
    lang_key: str,
) -> str:
    with tempfile.TemporaryDirectory(prefix="marktini_pdf_page_") as temp_dir:
        image_path = Path(temp_dir) / f"page-{page_number}.png"
        _render_pdf_page_to_image(file_path, page_number, image_path)
        text = _extract_region_text(image_path, lang_key)
        if not text.strip():
            raise IncompleteDocumentConversionError(
                f"Không thể xử lý đầy đủ trang {page_number}: OCR dự phòng không nhận diện được văn bản."
            )
        logger.warning("Recovered PDF page %s through bounded raster OCR", page_number)
        return text


def _convert_pdf_range(
    converter: Any,
    file_path: Path,
    start_page: int,
    end_page: int,
    lang_key: str = DEFAULT_OCR_LANG,
) -> str:
    expected_pages = end_page - start_page + 1
    result = converter.convert(
        file_path,
        raises_on_error=False,
        page_range=(start_page, end_page),
    )
    if _is_complete_result(result, expected_pages=expected_pages):
        return _export_result(result)

    logger.warning(
        "Incomplete PDF range %s-%s (status=%s, pages=%s/%s): %s",
        start_page,
        end_page,
        getattr(result, "status", "unknown"),
        len(getattr(result, "pages", None) or []),
        expected_pages,
        _conversion_error_summary(result),
    )
    del result
    gc.collect()

    if start_page == end_page:
        return _convert_rasterized_pdf_page(converter, file_path, start_page, lang_key)

    midpoint = (start_page + end_page) // 2
    left = _convert_pdf_range(converter, file_path, start_page, midpoint, lang_key)
    right = _convert_pdf_range(converter, file_path, midpoint + 1, end_page, lang_key)
    return "\n\n".join(part for part in (left, right) if part.strip())


def _convert_pdf_in_chunks(
    converter: Any,
    file_path: Path,
    lang_key: str = DEFAULT_OCR_LANG,
) -> str:
    page_count = _get_pdf_page_count(file_path)
    if page_count < 1:
        raise IncompleteDocumentConversionError("PDF không có trang nào để xử lý.")

    logger.info("Processing %s-page PDF in chunks of at most %s pages", page_count, PDF_CHUNK_SIZE)
    chunks: list[str] = []
    for start_page in range(1, page_count + 1, PDF_CHUNK_SIZE):
        end_page = min(start_page + PDF_CHUNK_SIZE - 1, page_count)
        chunks.append(_convert_pdf_range(converter, file_path, start_page, end_page, lang_key))
        gc.collect()
    return "\n\n".join(chunk for chunk in chunks if chunk.strip())


def convert_document_to_markdown(
    file_path: str,
    lang: str = DEFAULT_OCR_LANG,
    table_mode: str = DEFAULT_TABLE_MODE,
    original_filename: str | None = None,
) -> str:
    """
    Converts a document (PDF, DOCX, etc.) to Markdown using docling.
    Retains formatting, layout, tables, math/physics/chemistry formulas (as
    LaTeX), and source code blocks according to docling's capabilities.
    Post-processes the output with markdown_cleaner for better readability.
    
    Args:
        file_path: Path to the document file
        lang: OCR language preset (vi_en, vi, en)
        table_mode: Table recognition mode (accurate, fast)
        original_filename: Original filename to embed in metadata for traceability
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    try:
        import pathlib
        resolved_path = pathlib.Path(file_path).resolve()
        
        # Upscale region images (cropped from PDF viewer) to improve OCR accuracy
        processing_path = file_path
        is_region_image = resolved_path.suffix.lower() in {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff"}
        if is_region_image:
            processing_path = upscale_region_image(str(resolved_path))
            logger.info(f"Region image upscaling: {file_path} → {processing_path}")
        
        resolved_processing_path = pathlib.Path(processing_path).resolve()
        logger.info(f"Starting conversion for: {resolved_processing_path} (lang={lang}, table_mode={table_mode}, region={is_region_image})")

        if is_region_image:
            raw_markdown = _extract_region_text(resolved_processing_path, lang)
        else:
            converter = get_converter(lang, table_mode)
            # DocumentConverter pipelines hold native/ML state and are not treated
            # as thread-safe. The API job queue is also single-worker, but this lock
            # protects direct library callers and startup/request overlap.
            with heavy_job_slot("docling-conversion"):
                if resolved_processing_path.suffix.lower() == ".pdf":
                    raw_markdown = _convert_pdf_in_chunks(
                        converter,
                        resolved_processing_path,
                        lang,
                    )
                else:
                    result = converter.convert(resolved_processing_path, raises_on_error=False)
                    if not _is_complete_result(result):
                        raise IncompleteDocumentConversionError(
                            "Docling không thể xử lý đầy đủ tài liệu: "
                            f"{_conversion_error_summary(result)}"
                        )
                    raw_markdown = _export_result(result)
        logger.info(f"Raw conversion complete: {resolved_processing_path}")

        # Post-process: clean up tables, remove empty columns, etc.
        cleaned_markdown = clean_markdown(raw_markdown)
        logger.info(f"Post-processing complete: {file_path}")
        
        # Clean up temp upscaled file if it was created
        if is_region_image and processing_path != str(resolved_path):
            try:
                Path(processing_path).unlink()
                logger.info(f"Cleaned up temp upscaled file: {processing_path}")
            except Exception as e:
                logger.warning(f"Failed to clean up temp file {processing_path}: {e}")

        # Add metadata header with original filename for traceability
        # Frontend can use this to offer "Open Original" button
        if original_filename:
            metadata = f"<!-- Source file: {original_filename} -->\n\n"
            cleaned_markdown = metadata + cleaned_markdown

        return cleaned_markdown
    except Exception as e:
        import traceback
        logger.error(f"Error during document conversion: {e}\n{traceback.format_exc()}")
        raise
