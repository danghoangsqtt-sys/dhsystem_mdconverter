from __future__ import annotations

import unittest
from unittest.mock import patch

import httpx

from backend.src.services.mark_tini import citation_service

# Captured before any patching so the factory below never resolves back to
# its own patched replacement (patching citation_service.httpx.AsyncClient
# patches the shared httpx module, since citation_service does `import httpx`).
_RealAsyncClient = httpx.AsyncClient


def _client_factory(handler):
    def factory(*_args, **_kwargs) -> httpx.AsyncClient:
        return _RealAsyncClient(transport=httpx.MockTransport(handler))

    return factory


def _patch_client(handler):
    return patch(
        "backend.src.services.mark_tini.citation_service.httpx.AsyncClient",
        new=_client_factory(handler),
    )


class SearchOpenAlexTests(unittest.IsolatedAsyncioTestCase):
    async def test_good_match_populates_fields_and_confidence(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "results": [
                        {
                            "title": "Attention Is All You Need",
                            "authorships": [
                                {"author": {"display_name": "Ashish Vaswani"}},
                                {"author": {"display_name": "Noam Shazeer"}},
                            ],
                            "publication_year": 2017,
                            "doi": "https://doi.org/10.5555/3295222.3295349",
                        }
                    ]
                },
            )

        with _patch_client(handler):
            match = await citation_service.search_openalex("Attention Is All You Need")

        self.assertIsNotNone(match)
        assert match is not None
        self.assertEqual(match.title, "Attention Is All You Need")
        self.assertEqual(match.authors, ["Ashish Vaswani", "Noam Shazeer"])
        self.assertEqual(match.year, 2017)
        self.assertGreater(match.confidence, 0.9)

    async def test_empty_results_return_none(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"results": []})

        with _patch_client(handler):
            match = await citation_service.search_openalex("a nonsense query with no matches")

        self.assertIsNone(match)

    async def test_network_error_returns_none_instead_of_raising(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectTimeout("simulated timeout", request=request)

        with _patch_client(handler):
            match = await citation_service.search_openalex("anything")

        self.assertIsNone(match)

    async def test_blank_query_returns_none_without_a_network_call(self) -> None:
        called = False

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal called
            called = True
            return httpx.Response(200, json={"results": []})

        with _patch_client(handler):
            match = await citation_service.search_openalex("   ")

        self.assertIsNone(match)
        self.assertFalse(called)


class AssessWithOllamaTests(unittest.IsolatedAsyncioTestCase):
    async def test_successful_response_is_returned_stripped(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"response": "  Co ve phu hop, nhung chua chac chan.  "})

        with _patch_client(handler):
            assessment = await citation_service.assess_with_ollama(
                "some claim",
                None,
                base_url="http://127.0.0.1:11434",
                model="qwen2.5:7b",
            )

        self.assertEqual(assessment.text, "Co ve phu hop, nhung chua chac chan.")
        self.assertEqual(assessment.status, "available")

    async def test_unreachable_ollama_returns_none_instead_of_raising(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("simulated connection refused", request=request)

        with _patch_client(handler):
            assessment = await citation_service.assess_with_ollama(
                "some claim",
                None,
                base_url="http://127.0.0.1:11434",
                model="qwen2.5:7b",
            )

        self.assertIsNone(assessment.text)
        self.assertEqual(assessment.status, "unreachable")

    async def test_missing_model_returns_actionable_status(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(404, json={"error": "model not found"})

        with _patch_client(handler):
            assessment = await citation_service.assess_with_ollama(
                "some claim",
                None,
                base_url="http://127.0.0.1:11434",
                model="qwen2.5:3b",
            )

        self.assertIsNone(assessment.text)
        self.assertEqual(assessment.status, "model_missing")

    async def test_malformed_response_returns_none(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"unexpected": "shape"})

        with _patch_client(handler):
            assessment = await citation_service.assess_with_ollama(
                "some claim",
                None,
                base_url="http://127.0.0.1:11434",
                model="qwen2.5:7b",
            )

        self.assertIsNone(assessment.text)
        self.assertEqual(assessment.status, "error")


if __name__ == "__main__":
    unittest.main()
