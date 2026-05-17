import os
import logging
from docling.document_converter import DocumentConverter

# Set up simple logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize the converter globally so it can be reused
# This is efficient for a local server
try:
    converter = DocumentConverter()
except Exception as e:
    logger.error(f"Failed to initialize Docling DocumentConverter: {e}")
    converter = None

def convert_document_to_markdown(file_path: str) -> str:
    """
    Converts a document (PDF, DOCX, etc.) to Markdown using docling.
    Retains formatting, layout, math formulas, and charts according to docling's capabilities.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
        
    if converter is None:
        raise RuntimeError("Docling DocumentConverter is not initialized.")
        
    try:
        logger.info(f"Starting conversion for: {file_path}")
        result = converter.convert(file_path)
        
        # Export the document model to markdown
        markdown_content = result.document.export_to_markdown()
        logger.info(f"Successfully converted: {file_path}")
        
        return markdown_content
    except Exception as e:
        logger.error(f"Error during document conversion: {e}")
        raise e
