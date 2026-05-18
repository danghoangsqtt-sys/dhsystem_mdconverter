import os
import logging
from docling.document_converter import DocumentConverter, PdfFormatOption, WordFormatOption
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode

from .markdown_cleaner import clean_markdown

# Set up simple logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────
# Configure Docling with ACCURATE table recognition
# ──────────────────────────────────────────────────────────────
# TableFormerMode.ACCURATE: Better handling of merged cells,
# multi-row headers, and complex table structures.
# do_cell_matching: Ensures data maps to correct columns.
# Trade-off: ~2-3x slower than FAST mode, but significantly
# better quality for academic/structured documents.
# ──────────────────────────────────────────────────────────────
try:
    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_table_structure = True
    pipeline_options.table_structure_options.mode = TableFormerMode.ACCURATE
    pipeline_options.table_structure_options.do_cell_matching = True

    converter = DocumentConverter(
        format_options={
            # PDF: ML-based table recognition — needs explicit ACCURATE config.
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
            # DOCX: SimplePipeline + MsWordDocumentBackend reads OOXML directly.
            # No ML table-structure options exist for this pipeline; native XML
            # parsing already preserves the table layout from the Word file.
            InputFormat.DOCX: WordFormatOption(),
        }
    )
    logger.info("Docling DocumentConverter initialized with ACCURATE table mode.")
except Exception as e:
    logger.error(f"Failed to initialize Docling DocumentConverter: {e}")
    converter = None


def convert_document_to_markdown(file_path: str) -> str:
    """
    Converts a document (PDF, DOCX, etc.) to Markdown using docling.
    Retains formatting, layout, math formulas, and charts according to docling's capabilities.
    Post-processes the output with markdown_cleaner for better readability.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
        
    if converter is None:
        raise RuntimeError("Docling DocumentConverter is not initialized.")
        
    try:
        logger.info(f"Starting conversion for: {file_path}")
        result = converter.convert(file_path)
        
        # Export the document model to markdown
        raw_markdown = result.document.export_to_markdown()
        logger.info(f"Raw conversion complete: {file_path}")
        
        # Post-process: clean up tables, remove empty columns, etc.
        cleaned_markdown = clean_markdown(raw_markdown)
        logger.info(f"Post-processing complete: {file_path}")
        
        return cleaned_markdown
    except Exception as e:
        logger.error(f"Error during document conversion: {e}")
        raise e
