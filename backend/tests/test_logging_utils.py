from __future__ import annotations

import logging
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.src.logging_utils import (
    _REQUEST_ID,
    CorrelationIdMiddleware,
    RequestIdFilter,
    configure_logging,
    get_request_id,
)


class _RootLoggerStateIsolation(unittest.TestCase):
    """`configure_logging` mutates the process-wide root logger, so tests
    that call it must snapshot/restore root's handlers - otherwise a test
    here can silently swallow log output for the rest of the test run
    (including other files, since `unittest discover` shares one process)."""

    def setUp(self) -> None:
        super().setUp()
        root = logging.getLogger()
        self._saved_handlers = list(root.handlers)
        self._saved_level = root.level
        for handler in list(root.handlers):
            root.removeHandler(handler)

    def tearDown(self) -> None:
        root = logging.getLogger()
        for handler in list(root.handlers):
            handler.close()
            root.removeHandler(handler)
        for handler in self._saved_handlers:
            root.addHandler(handler)
        root.setLevel(self._saved_level)
        super().tearDown()


class ConfigureLoggingTests(_RootLoggerStateIsolation):
    def test_creates_rotating_file_handler_and_writes_stamped_lines(self) -> None:
        root = logging.getLogger()
        with TemporaryDirectory() as tmp:
            log_dir = Path(tmp) / "logs"
            configure_logging(log_dir, level=logging.INFO)

            logging.getLogger("test.configure_logging").info("hello from test")
            for handler in root.handlers:
                handler.flush()

            log_file = log_dir / "backend.log"
            self.assertTrue(log_file.is_file())
            content = log_file.read_text(encoding="utf-8")
            self.assertIn("hello from test", content)
            self.assertIn("[-]", content)  # no active request -> "-" placeholder

            # Windows can't delete a file that's still open under a live
            # handler - close before TemporaryDirectory's own cleanup runs.
            for handler in list(root.handlers):
                handler.close()
                root.removeHandler(handler)

    def test_is_idempotent_and_does_not_stack_handlers(self) -> None:
        root = logging.getLogger()
        with TemporaryDirectory() as tmp:
            log_dir = Path(tmp) / "logs"
            configure_logging(log_dir)
            configure_logging(log_dir)
            self.assertEqual(len(root.handlers), 2)  # console + file

            for handler in list(root.handlers):
                handler.close()
                root.removeHandler(handler)


class RequestIdFilterTests(unittest.TestCase):
    def test_defaults_to_placeholder_outside_a_request(self) -> None:
        self.assertEqual(get_request_id(), "-")

    def test_stamps_current_contextvar_value_onto_record(self) -> None:
        token = _REQUEST_ID.set("abc123")
        try:
            record = logging.LogRecord("x", logging.INFO, __file__, 1, "msg", None, None)
            RequestIdFilter().filter(record)
            self.assertEqual(record.request_id, "abc123")
        finally:
            _REQUEST_ID.reset(token)


class CorrelationIdMiddlewareTests(unittest.TestCase):
    def setUp(self) -> None:
        app = FastAPI()
        app.add_middleware(CorrelationIdMiddleware)

        @app.get("/ping")
        def ping() -> dict[str, str]:
            return {"request_id_seen_inside_handler": get_request_id()}

        self.client = TestClient(app)

    def test_response_carries_an_x_request_id_header(self) -> None:
        response = self.client.get("/ping")
        self.assertIn("x-request-id", response.headers)
        self.assertTrue(len(response.headers["x-request-id"]) > 0)

    def test_handler_sees_the_same_id_that_is_returned_in_the_header(self) -> None:
        response = self.client.get("/ping")
        header_id = response.headers["x-request-id"]
        body_id = response.json()["request_id_seen_inside_handler"]
        self.assertEqual(header_id, body_id)

    def test_two_requests_get_different_ids(self) -> None:
        first = self.client.get("/ping").headers["x-request-id"]
        second = self.client.get("/ping").headers["x-request-id"]
        self.assertNotEqual(first, second)

    def test_request_id_resets_after_the_request_completes(self) -> None:
        self.client.get("/ping")
        self.assertEqual(get_request_id(), "-")


if __name__ == "__main__":
    unittest.main()
