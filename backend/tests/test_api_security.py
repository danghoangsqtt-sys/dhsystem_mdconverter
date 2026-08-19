from __future__ import annotations

import unittest
from dataclasses import replace
from unittest.mock import patch

from fastapi.testclient import TestClient

import backend.src.main as main


class ApiSecurityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(main.app)
        self.auth = {main.API_TOKEN_HEADER: main.settings.api_token}

    def test_health_requires_session_token(self) -> None:
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 401)

        response = self.client.get("/api/health", headers=self.auth)
        self.assertEqual(response.status_code, 200)

    def test_session_rejects_untrusted_browser_origin(self) -> None:
        response = self.client.get(
            "/api/session",
            headers={"Origin": "https://attacker.example"},
        )
        self.assertEqual(response.status_code, 403)
        self.assertNotEqual(response.headers.get("access-control-allow-origin"), "*")

    def test_session_accepts_local_dev_origin(self) -> None:
        response = self.client.get(
            "/api/session",
            headers={"Origin": "http://127.0.0.1:5173"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["token"], main.settings.api_token)

    def test_download_path_traversal_is_rejected_by_uuid_validation(self) -> None:
        response = self.client.get(
            "/api/download/..%5C..%5CREADME",
            headers=self.auth,
        )
        self.assertIn(response.status_code, {404, 422})
        self.assertNotIn("DocuMark AI Editor", response.text)

    def test_unsupported_upload_is_rejected_before_queueing(self) -> None:
        response = self.client.post(
            "/api/jobs",
            headers=self.auth,
            files={"file": ("payload.exe", b"MZ", "application/octet-stream")},
        )
        self.assertEqual(response.status_code, 415)

    def test_verify_citation_requires_session_token(self) -> None:
        response = self.client.post("/api/verify-citation", json={"text": "some claim"})
        self.assertEqual(response.status_code, 401)

    def test_translate_requires_session_token(self) -> None:
        response = self.client.post("/api/translate", json={"text": "some text"})
        self.assertEqual(response.status_code, 401)

    def test_root_serves_built_frontend_instead_of_api_message(self) -> None:
        """Regression test: `read_root`'s JSON message used to be registered
        unconditionally, which permanently shadowed the StaticFiles mount at
        the same "/" path (Starlette matches routes in registration order) —
        so `start.bat`'s documented `http://localhost:8088` flow showed a bare
        JSON blob instead of the app UI whenever a frontend build existed.
        This only exercises the regression-relevant branch when `frontend/dist`
        has actually been built (e.g. via `npm run build`), same as production.
        """
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        if main.settings.frontend_dist_dir.is_dir():
            self.assertIn("text/html", response.headers.get("content-type", ""))
            self.assertIn('<div id="root">', response.text)
        else:
            self.assertEqual(response.json(), {"message": "DocuMark AI Local API"})

    def test_upload_limit_is_enforced_and_partial_file_is_removed(self) -> None:
        tiny_limit_settings = replace(main.settings, max_upload_bytes=4)
        before = set(main.settings.upload_dir.glob("*"))
        with patch.object(main, "settings", tiny_limit_settings):
            response = self.client.post(
                "/api/jobs",
                headers=self.auth,
                files={"file": ("large.pdf", b"12345", "application/pdf")},
            )
        self.assertEqual(response.status_code, 413)
        self.assertEqual(before, set(main.settings.upload_dir.glob("*")))

    def test_job_capacity_exceeded_returns_503_and_cleans_up_upload(self) -> None:
        before = set(main.settings.upload_dir.glob("*"))
        with patch.object(main.job_manager, "submit", side_effect=main.JobCapacityError("queue full")):
            response = self.client.post(
                "/api/jobs",
                headers=self.auth,
                files={"file": ("paper.pdf", b"%PDF-1.4", "application/pdf")},
            )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(before, set(main.settings.upload_dir.glob("*")))


if __name__ == "__main__":
    unittest.main()

