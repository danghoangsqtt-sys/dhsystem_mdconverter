from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from docling.datamodel.base_models import ConversionStatus, InputFormat

from backend.src.services import docling_service


class _FakeDocument:
    def __init__(self, markdown: str = "", texts: list[str] | None = None) -> None:
        self._markdown = markdown
        self.texts = [SimpleNamespace(text=text) for text in (texts or [])]

    def export_to_markdown(self) -> str:
        return self._markdown


class _FakeResult:
    def __init__(
        self,
        *,
        status: ConversionStatus,
        page_count: int,
        markdown: str = "",
        input_format: InputFormat = InputFormat.PDF,
        texts: list[str] | None = None,
        error: str | None = None,
    ) -> None:
        self.status = status
        self.pages = [object() for _ in range(page_count)]
        self.input = SimpleNamespace(format=input_format)
        self.document = _FakeDocument(markdown=markdown, texts=texts)
        self.errors = [] if error is None else [SimpleNamespace(error_message=error)]


class _ChunkConverter:
    def __init__(self, failing_page: int | None = None, fail_raster: bool = False) -> None:
        self.failing_page = failing_page
        self.fail_raster = fail_raster
        self.page_ranges: list[tuple[int, int]] = []

    def convert(self, path: Path, **kwargs):
        path = Path(path)
        start_page, end_page = kwargs["page_range"]
        self.page_ranges.append((start_page, end_page))
        expected = end_page - start_page + 1
        if self.failing_page is not None and start_page <= self.failing_page <= end_page:
            return _FakeResult(
                status=ConversionStatus.PARTIAL_SUCCESS,
                page_count=max(0, expected - 1),
                error="std::bad_alloc",
            )
        return _FakeResult(
            status=ConversionStatus.SUCCESS,
            page_count=expected,
            markdown=f"pages-{start_page}-{end_page}",
        )


class DoclingServiceLargePdfTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.pdf_path = Path(self.temp_dir.name) / "large.pdf"
        self.pdf_path.write_bytes(b"%PDF-1.4")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_long_pdf_is_converted_in_bounded_ordered_chunks(self) -> None:
        converter = _ChunkConverter()
        with patch.object(docling_service, "_get_pdf_page_count", return_value=10):
            markdown = docling_service._convert_pdf_in_chunks(converter, self.pdf_path)

        self.assertEqual(converter.page_ranges, [(1, 8), (9, 10)])
        self.assertEqual(markdown, "pages-1-8\n\npages-9-10")

    def test_partial_range_is_split_and_single_page_uses_raster_fallback(self) -> None:
        converter = _ChunkConverter(failing_page=3)

        def fake_render(_source: Path, page_number: int, output: Path) -> None:
            self.assertEqual(page_number, 3)
            output.write_bytes(b"png")

        with (
            patch.object(docling_service, "_get_pdf_page_count", return_value=4),
            patch.object(docling_service, "_render_pdf_page_to_image", side_effect=fake_render),
            patch.object(docling_service, "_extract_region_text", return_value="fallback-3"),
        ):
            markdown = docling_service._convert_pdf_in_chunks(converter, self.pdf_path)

        self.assertEqual(converter.page_ranges, [(1, 4), (1, 2), (3, 4), (3, 3), (4, 4)])
        self.assertEqual(markdown, "pages-1-2\n\nfallback-3\n\npages-4-4")

    def test_failed_raster_retry_raises_instead_of_returning_partial_output(self) -> None:
        converter = _ChunkConverter(failing_page=1, fail_raster=True)
        with (
            patch.object(docling_service, "_get_pdf_page_count", return_value=1),
            patch.object(
                docling_service,
                "_render_pdf_page_to_image",
                side_effect=lambda _source, _page, output: output.write_bytes(b"png"),
            ),
            patch.object(docling_service, "_extract_region_text", return_value=""),
        ):
            with self.assertRaisesRegex(
                docling_service.IncompleteDocumentConversionError,
                "trang 1",
            ):
                docling_service._convert_pdf_in_chunks(converter, self.pdf_path)

    def test_region_ocr_uses_permissive_full_crop_settings(self) -> None:
        reader = Mock()
        reader.readtext.return_value = ["Small bullet line", "£ 9"]
        image_path = Path(self.temp_dir.name) / "region.png"
        image_path.write_bytes(b"png")

        with patch.object(docling_service, "_get_region_reader", return_value=reader):
            text = docling_service._extract_region_text(image_path, "en")

        self.assertEqual(text, "Small bullet line\n£ 9")
        reader.readtext.assert_called_once_with(
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


if __name__ == "__main__":
    unittest.main()
