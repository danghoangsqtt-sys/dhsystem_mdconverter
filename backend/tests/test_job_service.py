from __future__ import annotations

import asyncio
import tempfile
import threading
import time
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from backend.src.services.mark_tini.job_service import ConversionJobManager, JobCapacityError


class JobServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.output_dir = self.root / "outputs"
        self.history_path = self.root / "history.json"
        self.active = 0
        self.max_active = 0
        self.lock = threading.Lock()

        def converter(path: str, _lang: str, _table_mode: str, original_filename: str | None) -> str:
            self.assertIsNotNone(original_filename)
            with self.lock:
                self.active += 1
                self.max_active = max(self.max_active, self.active)
            time.sleep(0.04)
            with self.lock:
                self.active -= 1
            return f"converted:{Path(path).name}"

        self.manager = ConversionJobManager(
            converter=converter,
            output_dir=self.output_dir,
            original_dir=self.root / "originals",
            history_path=self.history_path,
            max_history_entries=1,
        )
        await self.manager.start()

    async def asyncTearDown(self) -> None:
        await self.manager.stop()
        self.temp_dir.cleanup()

    def make_upload(self, name: str) -> Path:
        path = self.root / name
        path.write_bytes(b"input")
        return path

    async def submit(self, name: str, *, record_history: bool = True):
        return await self.manager.submit(
            job_id=str(uuid.uuid4()),
            original_filename=name,
            upload_path=self.make_upload(name),
            lang="en",
            table_mode="fast",
            record_history=record_history,
        )

    async def test_jobs_are_converted_sequentially(self) -> None:
        first = await self.submit("first.pdf")
        second = await self.submit("second.pdf")
        await asyncio.gather(first.done.wait(), second.done.wait())
        self.assertEqual(first.status, "complete")
        self.assertEqual(second.status, "complete")
        self.assertEqual(self.max_active, 1)

    async def test_record_history_false_does_not_create_output(self) -> None:
        job = await self.submit("region.png", record_history=False)
        await job.done.wait()
        self.assertEqual(job.status, "complete")
        self.assertEqual(list(self.output_dir.glob("*.md")), [])
        self.assertFalse(self.history_path.exists())

    async def test_history_eviction_removes_old_output(self) -> None:
        first = await self.submit("first.pdf")
        await first.done.wait()
        second = await self.submit("second.pdf")
        await second.done.wait()
        self.assertFalse((self.output_dir / f"{first.job_id}.md").exists())
        self.assertTrue((self.output_dir / f"{second.job_id}.md").exists())
        self.assertFalse((self.root / "originals" / f"{first.job_id}.pdf").exists())
        self.assertTrue((self.root / "originals" / f"{second.job_id}.pdf").exists())

    async def test_successful_history_job_persists_original_source(self) -> None:
        job = await self.submit("source.pdf")
        await job.done.wait()
        original = self.root / "originals" / f"{job.job_id}.pdf"
        self.assertTrue(original.is_file())
        self.assertEqual(original.read_bytes(), b"input")

    async def test_queue_capacity_is_bounded_and_completed_records_are_pruned(self) -> None:
        await self.manager.stop()
        gate = threading.Event()

        def blocked_converter(path: str, _lang: str, _mode: str, _original: str | None) -> str:
            gate.wait(timeout=2)
            return f"converted:{Path(path).name}"

        self.manager = ConversionJobManager(
            converter=blocked_converter,
            output_dir=self.output_dir,
            original_dir=self.root / "originals",
            history_path=self.history_path,
            max_job_records=1,
        )
        first = await self.submit("first.pdf", record_history=False)
        try:
            with self.assertRaises(JobCapacityError):
                await self.submit("rejected.pdf", record_history=False)
        finally:
            gate.set()
        await first.done.wait()
        replacement = await self.submit("replacement.pdf", record_history=False)
        await replacement.done.wait()
        self.assertEqual(replacement.status, "complete")

    async def test_running_cancel_discards_result_and_output(self) -> None:
        job = await self.submit("cancel.pdf")
        while job.status == "queued":
            await asyncio.sleep(0)
        self.manager.cancel(job.job_id)
        await job.done.wait()
        self.assertEqual(job.status, "cancelled")
        self.assertIsNone(job.markdown)
        self.assertFalse((self.output_dir / f"{job.job_id}.md").exists())

    async def test_history_failure_removes_partial_output(self) -> None:
        with patch(
            "backend.src.services.mark_tini.job_service.history_service.append_history",
            side_effect=OSError("disk error"),
        ):
            job = await self.submit("history-fails.pdf")
            await job.done.wait()
        self.assertEqual(job.status, "error")
        self.assertFalse((self.output_dir / f"{job.job_id}.md").exists())


if __name__ == "__main__":
    unittest.main()
