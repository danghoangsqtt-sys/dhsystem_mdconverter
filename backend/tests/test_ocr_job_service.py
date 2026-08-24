from __future__ import annotations

import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.src.services.ocr_job_service import (
    OcrInput,
    OcrJobCapacityError,
    OcrJobManager,
    OcrJobNotFoundError,
    OcrResultNotReadyError,
)


def _fake_page(index: int, filename: str, engine: str, *, text: str = "") -> dict[str, object]:
    return {
        "index": index,
        "filename": filename,
        "width": 10,
        "height": 10,
        "engine": engine,
        "recipe": [],
        "confidence": 0.9,
        "lines": [],
        "text": text,
        "error": None,
    }


class OcrJobServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.manager = OcrJobManager(max_records=100)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def make_input(self, name: str) -> OcrInput:
        path = self.root / name
        path.write_bytes(b"fake-image")
        return OcrInput(filename=name, path=path)

    def wait_for(self, manager: OcrJobManager, job, statuses: set[str], *, timeout: float = 2.0):
        deadline = time.monotonic() + timeout
        current = job
        while time.monotonic() < deadline:
            current = manager.get(job.job_id)
            if current.status in statuses:
                return current
            time.sleep(0.01)
        self.fail(f"job {job.job_id} did not reach {statuses} in time (last status: {current.status})")

    def test_job_recognizes_all_pages_and_completes(self) -> None:
        def fake_recognize(path, *, filename, index, preset, engine):
            return _fake_page(index, filename, engine, text="hello")

        with patch("backend.src.services.ocr_job_service.recognize_image", side_effect=fake_recognize):
            job = self.manager.create([self.make_input("a.png")], preset="balanced", engine="easyocr")
            done = self.wait_for(self.manager, job, {"complete", "error"})

        self.assertEqual(done.status, "complete")
        result = self.manager.result(job.job_id)
        self.assertEqual(len(result["pages"]), 1)
        self.assertEqual(result["pages"][0]["text"], "hello")

    def test_one_bad_page_does_not_hide_other_results(self) -> None:
        def fake_recognize(path, *, filename, index, preset, engine):
            if index == 1:
                raise RuntimeError("boom")
            return _fake_page(index, filename, engine, text="ok")

        with patch("backend.src.services.ocr_job_service.recognize_image", side_effect=fake_recognize):
            job = self.manager.create(
                [self.make_input("a.png"), self.make_input("b.png")],
                preset="balanced",
                engine="easyocr",
            )
            done = self.wait_for(self.manager, job, {"complete", "error"})

        self.assertEqual(done.status, "complete")
        result = self.manager.result(job.job_id)
        self.assertEqual(len(result["pages"]), 2)
        self.assertIsNone(result["pages"][0]["error"])
        self.assertIn("boom", result["pages"][1]["error"])

    def test_result_not_ready_before_completion(self) -> None:
        gate = threading.Event()

        def blocked_recognize(path, *, filename, index, preset, engine):
            gate.wait(timeout=2)
            return _fake_page(index, filename, engine)

        with patch("backend.src.services.ocr_job_service.recognize_image", side_effect=blocked_recognize):
            job = self.manager.create([self.make_input("a.png")], preset="balanced", engine="easyocr")
            try:
                with self.assertRaises(OcrResultNotReadyError):
                    self.manager.result(job.job_id)
            finally:
                gate.set()
            self.wait_for(self.manager, job, {"complete"})

    def test_unknown_job_raises_not_found(self) -> None:
        with self.assertRaises(OcrJobNotFoundError):
            self.manager.get("does-not-exist")

    def test_cancel_stops_before_remaining_pages(self) -> None:
        started = threading.Event()
        gate = threading.Event()

        def blocked_recognize(path, *, filename, index, preset, engine):
            started.set()
            gate.wait(timeout=2)
            return _fake_page(index, filename, engine)

        with patch("backend.src.services.ocr_job_service.recognize_image", side_effect=blocked_recognize):
            job = self.manager.create(
                [self.make_input("a.png"), self.make_input("b.png")],
                preset="balanced",
                engine="easyocr",
            )
            started.wait(timeout=2)
            self.manager.cancel(job.job_id)
            gate.set()
            done = self.wait_for(self.manager, job, {"cancelled"})

        self.assertEqual(done.status, "cancelled")
        self.assertLess(len(done.pages), 2)

    def test_inputs_are_deleted_after_processing(self) -> None:
        def fake_recognize(path, *, filename, index, preset, engine):
            return _fake_page(index, filename, engine)

        with patch("backend.src.services.ocr_job_service.recognize_image", side_effect=fake_recognize):
            input_ = self.make_input("a.png")
            job = self.manager.create([input_], preset="balanced", engine="easyocr")
            self.wait_for(self.manager, job, {"complete"})

        deadline = time.monotonic() + 2.0
        while input_.path.exists() and time.monotonic() < deadline:
            time.sleep(0.01)
        self.assertFalse(input_.path.exists())

    def test_active_job_capacity_is_bounded(self) -> None:
        gate = threading.Event()

        def blocked_recognize(path, *, filename, index, preset, engine):
            gate.wait(timeout=2)
            return _fake_page(index, filename, engine)

        manager = OcrJobManager(max_records=100, max_active_jobs=1)
        with patch("backend.src.services.ocr_job_service.recognize_image", side_effect=blocked_recognize):
            first = manager.create([self.make_input("a.png")], preset="balanced", engine="easyocr")
            try:
                with self.assertRaises(OcrJobCapacityError):
                    manager.create([self.make_input("b.png")], preset="balanced", engine="easyocr")
            finally:
                gate.set()
            self.wait_for(manager, first, {"complete"})

            # capacity frees up once the in-flight job reaches a terminal state
            third = manager.create([self.make_input("c.png")], preset="balanced", engine="easyocr")
            self.wait_for(manager, third, {"complete"})

    def test_trim_removes_oldest_completed_records_beyond_max_records(self) -> None:
        def fake_recognize(path, *, filename, index, preset, engine):
            return _fake_page(index, filename, engine)

        manager = OcrJobManager(max_records=1, max_active_jobs=10)
        with patch("backend.src.services.ocr_job_service.recognize_image", side_effect=fake_recognize):
            first = manager.create([self.make_input("a.png")], preset="balanced", engine="easyocr")
            self.wait_for(manager, first, {"complete"})
            second = manager.create([self.make_input("b.png")], preset="balanced", engine="easyocr")
            self.wait_for(manager, second, {"complete"})

        with self.assertRaises(OcrJobNotFoundError):
            manager.get(first.job_id)
        self.assertEqual(manager.get(second.job_id).status, "complete")


if __name__ == "__main__":
    unittest.main()
