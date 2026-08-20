from __future__ import annotations

import tempfile
import unittest
import zipfile
from pathlib import Path

from docx import Document
from PIL import Image

from backend.src.services import pdf_to_word_service


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SAMPLE_PDF = PROJECT_ROOT / "frontend" / "e2e" / "fixtures" / "sample.pdf"


class PdfToWordServiceTests(unittest.TestCase):
    def test_converts_every_pdf_page_to_a_floating_full_page_image(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "faithful.docx"
            progress: list[tuple[int, int]] = []

            result = pdf_to_word_service.convert_pdf_to_docx(
                SAMPLE_PDF,
                output_path,
                progress_callback=lambda current, total: progress.append((current, total)),
            )

            self.assertEqual(result.page_count, 1)
            self.assertEqual(progress, [(1, 1)])
            self.assertTrue(output_path.is_file())
            self.assertGreater(output_path.stat().st_size, 1_000)

            with zipfile.ZipFile(output_path) as archive:
                document_xml = archive.read("word/document.xml").decode("utf-8")
                media = [name for name in archive.namelist() if name.startswith("word/media/")]
            self.assertEqual(document_xml.count("<wp:anchor"), 1)
            self.assertNotIn("<wp:inline", document_xml)
            self.assertEqual(len(media), 1)

            document = Document(output_path)
            self.assertEqual(len(document.sections), 1)
            self.assertGreater(document.sections[0].page_width, 0)
            self.assertGreater(document.sections[0].page_height, 0)
            self.assertEqual(document.sections[0].top_margin, 0)
            self.assertEqual(document.sections[0].bottom_margin, 0)

    def test_oversized_pdf_page_is_scaled_without_changing_aspect_ratio(self) -> None:
        width, height = pdf_to_word_service._fit_word_page_size(3_000, 1_500)
        self.assertEqual(width, pdf_to_word_service.WORD_MAX_PAGE_POINTS)
        self.assertAlmostEqual(width / height, 2.0)

    def test_mixed_portrait_and_landscape_pages_keep_order_and_orientation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            pdf_path = temp_root / "mixed-pages.pdf"
            output_path = temp_root / "mixed-pages.docx"
            portrait = Image.new("RGB", (600, 800), "white")
            landscape = Image.new("RGB", (900, 500), "white")
            portrait.save(pdf_path, "PDF", save_all=True, append_images=[landscape], resolution=72)
            portrait.close()
            landscape.close()

            result = pdf_to_word_service.convert_pdf_to_docx(pdf_path, output_path)

            document = Document(output_path)
            self.assertEqual(result.page_count, 2)
            self.assertEqual(len(document.sections), 2)
            self.assertLess(document.sections[0].page_width, document.sections[0].page_height)
            self.assertGreater(document.sections[1].page_width, document.sections[1].page_height)
            with zipfile.ZipFile(output_path) as archive:
                document_xml = archive.read("word/document.xml").decode("utf-8")
            self.assertEqual(document_xml.count("<wp:anchor"), 2)

    def test_invalid_page_geometry_is_rejected(self) -> None:
        with self.assertRaises(pdf_to_word_service.PdfToWordConversionError):
            pdf_to_word_service._fit_word_page_size(0, 100)


if __name__ == "__main__":
    unittest.main()
