from __future__ import annotations

import tempfile
import unittest
import zipfile
from pathlib import Path

from docx import Document

from backend.src.services import markdown_to_word_service


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

    def test_empty_markdown_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with self.assertRaises(markdown_to_word_service.MarkdownToWordError):
                markdown_to_word_service.convert_markdown_to_docx(
                    "   ",
                    Path(temp_dir) / "empty.docx",
                )


if __name__ == "__main__":
    unittest.main()
