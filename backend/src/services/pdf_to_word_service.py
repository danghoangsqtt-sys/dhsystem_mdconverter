"""High-fidelity PDF-to-Word export.

The only deterministic way to preserve arbitrary PDF page content (fonts,
formulae, diagrams, annotations, and images) in Word is to rasterize each
page and place that lossless image at the exact page bounds.  The resulting
DOCX is visually faithful but intentionally not text-editable.
"""

from __future__ import annotations

import logging
import tempfile
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path


logger = logging.getLogger(__name__)

PDF_RENDER_DPI = 180
PDF_RENDER_MAX_DIMENSION = 5000
WORD_MAX_PAGE_POINTS = 22 * 72
WORD_MIN_PAGE_POINTS = 1


class PdfToWordConversionError(RuntimeError):
    """Raised when a PDF cannot be converted into a complete DOCX."""


@dataclass(frozen=True)
class PdfToWordResult:
    output_path: Path
    page_count: int


ProgressCallback = Callable[[int, int], None]


def _fit_word_page_size(width_points: float, height_points: float) -> tuple[float, float]:
    """Keep a PDF page's aspect ratio inside Word's 22-inch page limit."""
    if width_points <= 0 or height_points <= 0:
        raise PdfToWordConversionError("PDF chứa trang có kích thước không hợp lệ.")
    longest_edge = max(width_points, height_points)
    scale = min(1.0, WORD_MAX_PAGE_POINTS / longest_edge)
    return (
        max(WORD_MIN_PAGE_POINTS, width_points * scale),
        max(WORD_MIN_PAGE_POINTS, height_points * scale),
    )


def _configure_section(section: object, width_points: float, height_points: float) -> None:
    from docx.shared import Pt

    section.page_width = Pt(width_points)
    section.page_height = Pt(height_points)
    section.top_margin = Pt(0)
    section.bottom_margin = Pt(0)
    section.left_margin = Pt(0)
    section.right_margin = Pt(0)
    section.header_distance = Pt(0)
    section.footer_distance = Pt(0)
    section.gutter = Pt(0)


def _make_picture_page_floating(run: object, page_index: int) -> None:
    """Convert python-docx's inline picture into a page-positioned anchor.

    Inline pictures participate in line layout and can push an image that is
    exactly page-height onto an extra blank page. A floating image positioned
    at (0, 0) relative to the physical page has no such baseline and therefore
    covers the PDF page bounds deterministically.
    """
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn

    inline_nodes = run._r.xpath("./w:drawing/wp:inline")
    if len(inline_nodes) != 1:
        raise PdfToWordConversionError("Không thể định vị ảnh trang trong tài liệu Word.")
    anchor = inline_nodes[0]
    anchor.tag = qn("wp:anchor")
    anchor.attrib.clear()
    for name, value in {
        "distT": "0",
        "distB": "0",
        "distL": "0",
        "distR": "0",
        "simplePos": "0",
        "relativeHeight": str(251_659_264 + page_index),
        "behindDoc": "0",
        "locked": "0",
        "layoutInCell": "1",
        "allowOverlap": "1",
    }.items():
        anchor.set(name, value)

    simple_position = OxmlElement("wp:simplePos")
    simple_position.set("x", "0")
    simple_position.set("y", "0")

    horizontal_position = OxmlElement("wp:positionH")
    horizontal_position.set("relativeFrom", "page")
    horizontal_offset = OxmlElement("wp:posOffset")
    horizontal_offset.text = "0"
    horizontal_position.append(horizontal_offset)

    vertical_position = OxmlElement("wp:positionV")
    vertical_position.set("relativeFrom", "page")
    vertical_offset = OxmlElement("wp:posOffset")
    vertical_offset.text = "0"
    vertical_position.append(vertical_offset)

    anchor.insert(0, simple_position)
    anchor.insert(1, horizontal_position)
    anchor.insert(2, vertical_position)

    effect_extent = anchor.find(qn("wp:effectExtent"))
    wrap_none = OxmlElement("wp:wrapNone")
    if effect_extent is None:
        anchor.insert(4, wrap_none)
    else:
        anchor.insert(anchor.index(effect_extent) + 1, wrap_none)


def _add_page_image(
    document: object,
    image_path: Path,
    page_index: int,
    width_points: float,
    height_points: float,
) -> None:
    from docx.enum.section import WD_SECTION
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Pt

    if page_index == 0:
        section = document.sections[0]
        paragraph = document.paragraphs[0] if document.paragraphs else document.add_paragraph()
    else:
        section = document.add_section(WD_SECTION.NEW_PAGE)
        paragraph = document.paragraphs[-1]

    _configure_section(section, width_points, height_points)
    paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
    paragraph.paragraph_format.space_before = Pt(0)
    paragraph.paragraph_format.space_after = Pt(0)
    paragraph.paragraph_format.left_indent = Pt(0)
    paragraph.paragraph_format.right_indent = Pt(0)
    paragraph.paragraph_format.first_line_indent = Pt(0)
    paragraph.paragraph_format.line_spacing = Pt(1)

    run = paragraph.add_run()
    inline_shape = run.add_picture(
        str(image_path),
        width=Pt(width_points),
        height=Pt(height_points),
    )
    inline_shape._inline.docPr.set("name", f"PDF page {page_index + 1}")
    inline_shape._inline.docPr.set("descr", f"Trang PDF {page_index + 1}")
    _make_picture_page_floating(run, page_index)


def convert_pdf_to_docx(
    pdf_path: Path,
    output_path: Path,
    *,
    progress_callback: ProgressCallback | None = None,
) -> PdfToWordResult:
    """Render every PDF page losslessly into an identically-sized DOCX page."""
    import pypdfium2 as pdfium
    from docx import Document

    pdf_path = Path(pdf_path)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_output = output_path.with_name(f".{output_path.name}.tmp")
    temporary_output.unlink(missing_ok=True)

    pdf_document = None
    try:
        pdf_document = pdfium.PdfDocument(str(pdf_path))
        page_count = len(pdf_document)
        if page_count < 1:
            raise PdfToWordConversionError("PDF không có trang nào để chuyển đổi.")

        word_document = Document()
        word_document.core_properties.title = pdf_path.stem
        word_document.core_properties.subject = "Bản Word giữ nguyên hình thức từ PDF"
        word_document.core_properties.comments = (
            "Mỗi trang được nhúng dưới dạng ảnh lossless để giữ nguyên bố cục PDF."
        )

        with tempfile.TemporaryDirectory(prefix="mark-tini-pdf-word-") as temp_dir:
            temp_root = Path(temp_dir)
            for page_index in range(page_count):
                page = None
                bitmap = None
                image_path = temp_root / f"page-{page_index + 1:05d}.png"
                try:
                    page = pdf_document[page_index]
                    pdf_width, pdf_height = page.get_size()
                    word_width, word_height = _fit_word_page_size(pdf_width, pdf_height)
                    longest_edge = max(pdf_width, pdf_height, 1)
                    render_scale = min(
                        PDF_RENDER_DPI / 72,
                        PDF_RENDER_MAX_DIMENSION / longest_edge,
                    )
                    bitmap = page.render(scale=max(0.05, render_scale))
                    bitmap.to_pil().convert("RGB").save(
                        image_path,
                        format="PNG",
                        optimize=False,
                        compress_level=6,
                        dpi=(PDF_RENDER_DPI, PDF_RENDER_DPI),
                    )
                    _add_page_image(
                        word_document,
                        image_path,
                        page_index,
                        word_width,
                        word_height,
                    )
                    if progress_callback is not None:
                        progress_callback(page_index + 1, page_count)
                finally:
                    if bitmap is not None:
                        bitmap.close()
                    if page is not None:
                        page.close()
                    image_path.unlink(missing_ok=True)

        word_document.save(temporary_output)
        temporary_output.replace(output_path)
        logger.info("Exported %s PDF pages to %s", page_count, output_path)
        return PdfToWordResult(output_path=output_path, page_count=page_count)
    except PdfToWordConversionError:
        temporary_output.unlink(missing_ok=True)
        output_path.unlink(missing_ok=True)
        raise
    except Exception as exc:
        temporary_output.unlink(missing_ok=True)
        output_path.unlink(missing_ok=True)
        logger.exception("PDF-to-Word export failed for %s", pdf_path)
        raise PdfToWordConversionError("Không thể tạo file Word hoàn chỉnh từ PDF.") from exc
    finally:
        if pdf_document is not None:
            pdf_document.close()
