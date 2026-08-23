from __future__ import annotations

import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from backend.src.services import image_ocr_service
from backend.src.services.image_preprocessor import UnsafeImageError, preprocess_image
from backend.src.services.ocr_job_service import OcrInput, OcrJobManager

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "ocr"


class ImageOcrServiceTests(unittest.TestCase):
    def _image(self, directory: str, name: str = "page.png") -> Path:
        path = Path(directory) / name
        Image.new("RGB", (320, 180), "white").save(path, "PNG")
        return path

    def test_preprocessing_preserves_source_and_returns_recipe(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = self._image(temp_dir)
            before = image_path.read_bytes()
            result = preprocess_image(image_path, "balanced")
            self.assertEqual(before, image_path.read_bytes())
            self.assertGreater(result.width, 0)
            self.assertGreater(result.height, 0)
            self.assertIn("safe-decode", result.recipe)
            self.assertIn("shadow-normalize", result.recipe)

    def test_corrupt_image_is_rejected_safely(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "broken.png"
            image_path.write_bytes(b"not an image")
            with self.assertRaises(UnsafeImageError):
                preprocess_image(image_path)

    def test_easyocr_recognizes_vietnamese_diacritics(self) -> None:
        # Real, unmocked inference: RapidOCR (the engine this project evaluated
        # and dropped) strips 100% of Vietnamese diacritics because its bundled
        # dictionaries have no matching characters. This guards against a future
        # engine swap silently reintroducing that regression.
        image_path = FIXTURES_DIR / "vn_diacritics.png"
        if not image_path.is_file():
            self.skipTest(f"Thiếu fixture khóa: {image_path}")
        try:
            image_ocr_service._get_easyocr()
        except Exception as exc:  # model EasyOCR chưa tải sẵn trên máy này
            self.skipTest(f"EasyOCR chưa sẵn sàng trên máy này: {exc}")

        result = image_ocr_service.recognize_image(
            image_path, filename="vn_diacritics.png", index=0, preset="original"
        )

        self.assertEqual(result["engine"], "easyocr")
        recognized = result["text"]
        for must_contain in ("ộ", "ã", "ệ"):
            self.assertIn(must_contain, recognized)

    def test_job_cancel_does_not_publish_a_complete_result(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            first = self._image(temp_dir, "first.png")
            second = self._image(temp_dir, "second.png")
            manager = OcrJobManager()

            def slow_recognize(path: Path, **kwargs: object) -> dict[str, object]:
                time.sleep(0.1)
                return {
                    "index": kwargs["index"], "filename": path.name, "text": "ok", "error": None
                }

            with patch("backend.src.services.ocr_job_service.recognize_image", side_effect=slow_recognize):
                job = manager.create(
                    [OcrInput("first.png", first), OcrInput("second.png", second)],
                    preset="original",
                    engine="easyocr",
                )
                manager.cancel(job.job_id)
                deadline = time.time() + 3
                while manager.get(job.job_id).status not in {"cancelled", "error", "complete"}:
                    self.assertLess(time.time(), deadline)
                    time.sleep(0.02)
            self.assertEqual(manager.get(job.job_id).status, "cancelled")
            self.assertFalse(first.exists())
            self.assertFalse(second.exists())


if __name__ == "__main__":
    unittest.main()
