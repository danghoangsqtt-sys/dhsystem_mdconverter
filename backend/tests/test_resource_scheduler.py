import threading
import time
import unittest

from backend.src.services.resource_scheduler import (
    heavy_job_slot,
    reset_scheduler_metrics_for_test,
    scheduler_snapshot,
)


class ResourceSchedulerTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_scheduler_metrics_for_test()

    def test_heavy_jobs_never_overlap(self) -> None:
        entered: list[str] = []
        release_first = threading.Event()
        first_entered = threading.Event()

        def first() -> None:
            with heavy_job_slot("docling"):
                entered.append("docling")
                first_entered.set()
                release_first.wait(timeout=2)

        def second() -> None:
            first_entered.wait(timeout=2)
            with heavy_job_slot("ocr"):
                entered.append("ocr")

        first_thread = threading.Thread(target=first)
        second_thread = threading.Thread(target=second)
        first_thread.start()
        second_thread.start()
        first_entered.wait(timeout=2)
        time.sleep(0.05)
        self.assertEqual(entered, ["docling"])
        release_first.set()
        first_thread.join(timeout=2)
        second_thread.join(timeout=2)

        self.assertEqual(entered, ["docling", "ocr"])
        self.assertEqual(scheduler_snapshot().peak_concurrency, 1)


if __name__ == "__main__":
    unittest.main()
