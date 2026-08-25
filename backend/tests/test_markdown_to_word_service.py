from __future__ import annotations

import base64
import io
import tempfile
import unittest
import zipfile
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from PIL import Image

from backend.src.services.mark_tini import markdown_to_word_service


class MarkdownToWordServiceTests(unittest.TestCase):
    def test_docling_markdown_becomes_native_editable_word_content(self) -> None:
        markdown = """# Báo cáo Docling

Đây là **văn bản chỉnh sửa được** với *định dạng*.

- Mục thứ nhất
- Mục thứ hai

| Cột A | Cột B |
| --- | --- |
| Dữ liệu 1 | Dữ liệu 2 |

```python
print("Tini")
```
"""
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "editable.docx"
            result = markdown_to_word_service.convert_markdown_to_docx(
                markdown,
                output_path,
                document_title="Báo cáo",
            )

            self.assertEqual(result, output_path)
            document = Document(output_path)
            text = "\n".join(paragraph.text for paragraph in document.paragraphs)
            self.assertIn("Báo cáo Docling", text)
            self.assertIn("văn bản chỉnh sửa được", text)
            self.assertIn("Mục thứ nhất", text)
            self.assertIn('print("Tini")', text)
            self.assertEqual(document.tables[0].cell(1, 0).text, "Dữ liệu 1")
            self.assertEqual(document.core_properties.title, "Báo cáo")
            with zipfile.ZipFile(output_path) as archive:
                media = [name for name in archive.namelist() if name.startswith("word/media/")]
            self.assertEqual(media, [])

    def test_embedded_image_is_written_as_real_centered_picture(self) -> None:
        buffer = io.BytesIO()
        Image.new("RGB", (40, 20), color=(200, 30, 30)).save(buffer, format="PNG")
        data_uri = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
        markdown = f"""# Tài liệu có sơ đồ

Đoạn mở đầu.

![Sơ đồ khối]({data_uri})

Đoạn kết thúc.
"""
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "with-image.docx"
            markdown_to_word_service.convert_markdown_to_docx(markdown, output_path)

            document = Document(output_path)
            self.assertEqual(len(document.inline_shapes), 1)
            centered = [p for p in document.paragraphs if p.alignment == WD_ALIGN_PARAGRAPH.CENTER]
            self.assertEqual(len(centered), 1)
            with zipfile.ZipFile(output_path) as archive:
                media = [name for name in archive.namelist() if name.startswith("word/media/")]
            self.assertEqual(len(media), 1)

    def test_corrupt_image_data_falls_back_to_alt_text_without_crashing(self) -> None:
        markdown = "![Sơ đồ hỏng](data:image/png;base64,%%%not-valid%%%)\n"
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "broken-image.docx"
            markdown_to_word_service.convert_markdown_to_docx(markdown, output_path)

            document = Document(output_path)
            text = "\n".join(paragraph.text for paragraph in document.paragraphs)
            self.assertIn("[Sơ đồ hỏng]", text)
            with zipfile.ZipFile(output_path) as archive:
                media = [name for name in archive.namelist() if name.startswith("word/media/")]
            self.assertEqual(media, [])

    def test_empty_markdown_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with self.assertRaises(markdown_to_word_service.MarkdownToWordError):
                markdown_to_word_service.convert_markdown_to_docx(
                    "   ",
                    Path(temp_dir) / "empty.docx",
                )


if __name__ == "__main__":
    unittest.main()
