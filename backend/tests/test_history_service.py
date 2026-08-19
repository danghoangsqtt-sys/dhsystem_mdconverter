from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from backend.src.services import history_service


class HistoryServiceTests(unittest.TestCase):
    def test_append_returns_evicted_ids_and_keeps_newest_first(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "history.json"
            self.assertEqual(history_service.append_history(path, "one", "one.pdf", "en", "fast", 2), [])
            self.assertEqual(history_service.append_history(path, "two", "two.pdf", "en", "fast", 2), [])
            self.assertEqual(
                history_service.append_history(path, "three", "three.pdf", "en", "fast", 2),
                ["one"],
            )
            self.assertEqual([item["job_id"] for item in history_service.list_history(path)], ["three", "two"])
            self.assertEqual(list(path.parent.glob("*.tmp-*")), [])

    def test_non_list_history_is_treated_as_empty(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "history.json"
            path.write_text(json.dumps({"unexpected": True}), encoding="utf-8")
            self.assertEqual(history_service.list_history(path), [])


if __name__ == "__main__":
    unittest.main()

