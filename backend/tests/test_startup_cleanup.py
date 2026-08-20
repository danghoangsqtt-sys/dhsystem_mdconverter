from __future__ import annotations

import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

import backend.src.main as main
from backend.src.services import history_service


class StartupCleanupTests(unittest.TestCase):
    """Covers the two crash-recovery reconciliation steps that run in
    `lifespan()` before the job worker starts: stale uploads (pre-existing)
    and orphaned outputs (new - closes the gap where a crash between writing
    an output file and recording its history entry left a `.md` file that no
    part of the API could ever see or remove)."""

    def _patched_settings(self, temp_dir: Path):
        return replace(
            main.settings,
            upload_dir=temp_dir / "uploads",
            output_dir=temp_dir / "outputs",
            original_dir=temp_dir / "originals",
            history_path=temp_dir / "history.json",
        )

    def test_cleanup_stale_uploads_removes_direct_files_only(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp_dir:
            temp_dir = Path(raw_temp_dir)
            test_settings = self._patched_settings(temp_dir)
            test_settings.upload_dir.mkdir(parents=True)
            (test_settings.upload_dir / "leftover.pdf").write_bytes(b"%PDF-1.4")
            (test_settings.upload_dir / "another.docx").write_bytes(b"PK")
            subdir = test_settings.upload_dir / "not-a-file"
            subdir.mkdir()

            with patch.object(main, "settings", test_settings):
                main._cleanup_stale_uploads()

            self.assertEqual(list(test_settings.upload_dir.glob("*.pdf")), [])
            self.assertEqual(list(test_settings.upload_dir.glob("*.docx")), [])
            self.assertTrue(subdir.is_dir())

    def test_cleanup_orphaned_outputs_removes_files_without_history_entry(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp_dir:
            temp_dir = Path(raw_temp_dir)
            test_settings = self._patched_settings(temp_dir)
            test_settings.output_dir.mkdir(parents=True)

            history_service.append_history(
                test_settings.history_path, "kept-job", "kept.pdf", "en", "fast", 200
            )
            (test_settings.output_dir / "kept-job.md").write_text("# kept", encoding="utf-8")
            (test_settings.output_dir / "orphan-job.md").write_text("# orphan", encoding="utf-8")

            with patch.object(main, "settings", test_settings):
                main._cleanup_orphaned_outputs()

            self.assertTrue((test_settings.output_dir / "kept-job.md").is_file())
            self.assertFalse((test_settings.output_dir / "orphan-job.md").is_file())

    def test_cleanup_orphaned_outputs_removes_leftover_atomic_write_temp_file(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp_dir:
            temp_dir = Path(raw_temp_dir)
            test_settings = self._patched_settings(temp_dir)
            test_settings.output_dir.mkdir(parents=True)
            leftover_temp = test_settings.output_dir / "some-job.md.tmp-1234-1"
            leftover_temp.write_text("half-written", encoding="utf-8")

            with patch.object(main, "settings", test_settings):
                main._cleanup_orphaned_outputs()

            self.assertFalse(leftover_temp.exists())

    def test_cleanup_orphaned_outputs_handles_missing_history_file(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp_dir:
            temp_dir = Path(raw_temp_dir)
            test_settings = self._patched_settings(temp_dir)
            test_settings.output_dir.mkdir(parents=True)
            (test_settings.output_dir / "orphan-job.md").write_text("# orphan", encoding="utf-8")

            with patch.object(main, "settings", test_settings):
                main._cleanup_orphaned_outputs()

            self.assertEqual(list(test_settings.output_dir.glob("*.md")), [])

    def test_cleanup_orphaned_originals_keeps_only_history_sources(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp_dir:
            temp_dir = Path(raw_temp_dir)
            test_settings = self._patched_settings(temp_dir)
            test_settings.original_dir.mkdir(parents=True)
            history_service.append_history(
                test_settings.history_path, "kept-job", "kept.pdf", "en", "fast", 200
            )
            (test_settings.original_dir / "kept-job.pdf").write_bytes(b"kept")
            (test_settings.original_dir / "orphan-job.docx").write_bytes(b"orphan")

            with patch.object(main, "settings", test_settings):
                main._cleanup_orphaned_originals()

            self.assertTrue((test_settings.original_dir / "kept-job.pdf").is_file())
            self.assertFalse((test_settings.original_dir / "orphan-job.docx").exists())


if __name__ == "__main__":
    unittest.main()
