from __future__ import annotations

import tempfile
import unittest
import zipfile
from pathlib import Path

from docx import Document
from PIL import Image

from backend.src.services.tini_ocr.ocr_export_service import build_ocr_export


class OcrExportServiceTests(unittest.TestCase):
    pages = [
        {"filename": "trang-1.png", "text": "Nội dung đã sửa\nDòng thứ hai"},
        {"filename": "trang-2.jpg", "text": "Editable OCR text"},
    ]

    def test_txt_and_markdown_keep_reviewed_page_order(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            txt = build_ocr_export("txt", self.pages, root / "result.txt").read_text("utf-8")
            markdown = build_ocr_export("markdown", self.pages, root / "result.md").read_text("utf-8")
            self.assertLess(txt.index("Nội dung đã sửa"), txt.index("Editable OCR text"))
            self.assertIn("## trang-1.png", markdown)
            self.assertIn("## trang-2.jpg", markdown)

    def test_editable_docx_uses_reviewed_text(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output = build_ocr_export("docx-editable", self.pages, Path(temp_dir) / "editable.docx")
            document = Document(output)
            text = "\n".join(paragraph.text for paragraph in document.paragraphs)
            self.assertIn("Nội dung đã sửa", text)
            self.assertIn("Editable OCR text", text)

    def test_faithful_docx_embeds_every_image(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            images = [root / "one.png", root / "two.jpg"]
            Image.new("RGB", (600, 800), "white").save(images[0], "PNG")
            Image.new("RGB", (800, 600), "white").save(images[1], "JPEG")
            output = build_ocr_export("docx-faithful", self.pages, root / "faithful.docx", images)
            with zipfile.ZipFile(output) as archive:
                media = [name for name in archive.namelist() if name.startswith("word/media/")]
            self.assertEqual(len(media), 2)


if __name__ == "__main__":
    unittest.main()
