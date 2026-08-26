from __future__ import annotations

import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from backend.src.services.tini_ocr import image_ocr_service
from backend.src.services.tini_ocr.image_preprocessor import UnsafeImageError, preprocess_image
from backend.src.services.tini_ocr.ocr_job_service import OcrInput, OcrJobManager

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

    def test_small_image_is_upscaled_before_ocr_preprocessing(self) -> None:
        # Tini OCR's own resolution floor (image_preprocessor.MIN_OCR_WIDTH),
        # independent of Mark Tini's docling_service.upscale_region_image
        # (which is calibrated for small PDF-viewer crops, not whole-page
        # phone photos). A 320x180 source is well under the floor.
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = self._image(temp_dir)
            result = preprocess_image(image_path, "balanced")
            self.assertGreaterEqual(result.width, 1600)
            self.assertTrue(any(step.startswith("upscale:") for step in result.recipe))

    def test_already_large_image_is_not_upscaled(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "large.png"
            Image.new("RGB", (1800, 1000), "white").save(image_path, "PNG")
            result = preprocess_image(image_path, "balanced")
            self.assertEqual(result.width, 1800)
            self.assertFalse(any(step.startswith("upscale:") for step in result.recipe))

    def test_original_preset_skips_upscale(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = self._image(temp_dir)
            result = preprocess_image(image_path, "original")
            self.assertEqual(result.width, 320)

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
            image_path, filename="vn_diacritics.png", index=0, preset="original", lang="vi_en"
        )

        self.assertEqual(result["engine"], "easyocr")
        recognized = result["text"]
        for must_contain in ("ộ", "ã", "ệ"):
            self.assertIn(must_contain, recognized)

    def _line(self, text: str, box: list[list[float]], confidence: float = 0.9) -> dict[str, object]:
        return {"text": text, "confidence": confidence, "box": box}

    def test_dedupe_drops_nested_lower_confidence_box(self) -> None:
        # A coarse box and a near-identical/nested box for the same text
        # region (the pattern EasyOCR's detector occasionally emits) should
        # collapse to the higher-confidence one, not appear twice.
        coarse = self._line("công nghệ", [[100, 100], [200, 100], [200, 120], [100, 120]], 0.4)
        nested = self._line("công nghệ", [[102, 101], [198, 101], [198, 119], [102, 119]], 0.9)
        result = image_ocr_service._dedupe_and_order([coarse, nested])
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["confidence"], 0.9)

    def test_adjacent_words_on_the_same_line_are_both_kept(self) -> None:
        # Two distinct words side by side (non-overlapping boxes) must not be
        # treated as duplicates just because they share a row.
        left = self._line("Độc lập -", [[400, 100], [500, 100], [500, 120], [400, 120]])
        right = self._line("Tự do", [[520, 100], [600, 100], [600, 120], [520, 120]])
        result = image_ocr_service._dedupe_and_order([left, right])
        self.assertEqual(len(result), 2)

    def test_scrambled_fragments_sort_into_reading_order(self) -> None:
        # Fragments arrive in an arbitrary order (EasyOCR does not sort by
        # position); they should come back top-to-bottom, left-to-right.
        row2_right = self._line("hai", [[300, 200], [400, 200], [400, 220], [300, 220]])
        row1_right = self._line("một", [[300, 100], [400, 100], [400, 120], [300, 120]])
        row2_left = self._line("dòng", [[100, 200], [200, 200], [200, 220], [100, 220]])
        row1_left = self._line("dòng", [[100, 100], [200, 100], [200, 120], [100, 120]])
        result = image_ocr_service._dedupe_and_order([row2_right, row1_right, row2_left, row1_left])
        self.assertEqual([line["text"] for line in result], ["dòng", "một", "dòng", "hai"])

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

            with patch("backend.src.services.tini_ocr.ocr_job_service.recognize_image", side_effect=slow_recognize):
                job = manager.create(
                    [OcrInput("first.png", first), OcrInput("second.png", second)],
                    preset="original",
                    engine="easyocr",
                    language="vi_en",
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
