"""Citation existence lookup (OpenAlex) and advisory-only plausibility hints (local Ollama).

Both lookups are best-effort: network failures, timeouts, and empty results
are swallowed and reported back as "unavailable" rather than raised, so a
single flaky external call never turns into a 500 for the user.
"""

from __future__ import annotations

import difflib
import logging
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

OPENALEX_SEARCH_URL = "https://api.openalex.org/works"

_OLLAMA_PROMPT_TEMPLATE = """Bạn là trợ lý hỗ trợ nghiên cứu khoa học. Nhiệm vụ: đưa ra nhận định \
THẬN TRỌNG về việc đoạn trích dưới đây có vẻ được nguồn đã tìm thấy hỗ trợ hay không. Đây KHÔNG \
phải là kết luận cuối cùng — nếu không chắc chắn, hãy nói rõ là không chắc chắn thay vì đoán liều. \
Trả lời ngắn gọn (2-4 câu), bằng tiếng Việt.

Đoạn trích cần đánh giá:
\"\"\"{selected_text}\"\"\"

Nguồn tìm thấy (có thể không chính xác hoặc không liên quan):
{source_description}
"""


@dataclass
class CitationMatch:
    title: str
    authors: list[str]
    year: int | None
    doi: str | None
    confidence: float

    def public_state(self) -> dict[str, object]:
        return {
            "title": self.title,
            "authors": self.authors,
            "year": self.year,
            "doi": self.doi,
            "confidence": self.confidence,
        }


@dataclass
class CitationVerificationResult:
    query_text: str
    match: CitationMatch | None
    llm_assessment: str | None
    llm_available: bool
    llm_status: str
    llm_model: str | None

    def public_state(self) -> dict[str, object]:
        return {
            "query_text": self.query_text,
            "match": self.match.public_state() if self.match else None,
            "llm_assessment": self.llm_assessment,
            "llm_available": self.llm_available,
            "llm_status": self.llm_status,
            "llm_model": self.llm_model,
        }


@dataclass
class OllamaAssessmentResult:
    text: str | None
    status: str


async def search_openalex(query: str, *, timeout: float = 10.0) -> CitationMatch | None:
    """Look up the closest matching scholarly work for `query` via OpenAlex.

    Returns None on any network error, timeout, or empty result set. Callers
    must treat that as "couldn't verify" — never as "citation is fake".
    """
    normalized_query = query.strip()
    if not normalized_query:
        return None
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(
                OPENALEX_SEARCH_URL,
                params={"search": normalized_query, "per_page": 1},
            )
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("OpenAlex lookup failed: %s", exc)
        return None

    results = payload.get("results") or []
    if not results:
        return None
    top = results[0]

    title = str(top.get("title") or top.get("display_name") or "").strip()
    if not title:
        return None
    authors = [
        name
        for authorship in top.get("authorships") or []
        if (name := str((authorship.get("author") or {}).get("display_name") or "").strip())
    ]
    year = top.get("publication_year")
    doi = top.get("doi")
    confidence = difflib.SequenceMatcher(None, normalized_query.lower(), title.lower()).ratio()

    return CitationMatch(
        title=title,
        authors=authors,
        year=year if isinstance(year, int) else None,
        doi=str(doi) if doi else None,
        confidence=round(confidence, 3),
    )


def _describe_match(match: CitationMatch | None) -> str:
    if match is None:
        return "(không tìm thấy nguồn phù hợp)"
    authors = ", ".join(match.authors[:3]) or "(không rõ tác giả)"
    return f"{match.title} — {authors} ({match.year or 'năm không rõ'})"


async def assess_with_ollama(
    selected_text: str,
    match: CitationMatch | None,
    *,
    base_url: str,
    model: str,
    timeout: float = 30.0,
) -> OllamaAssessmentResult:
    """Ask a local Ollama model for a hedged plausibility read.

    Returns a stable status (never raises) so the UI can distinguish an
    unreachable service from a missing model and show the correct setup step.
    """
    prompt = _OLLAMA_PROMPT_TEMPLATE.format(
        selected_text=selected_text.strip(),
        source_description=_describe_match(match),
    )
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{base_url.rstrip('/')}/api/generate",
                json={"model": model, "prompt": prompt, "stream": False},
            )
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        status = "model_missing" if exc.response.status_code == 404 else "error"
        logger.info("Ollama assessment unavailable (%s): %s", status, exc)
        return OllamaAssessmentResult(text=None, status=status)
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        logger.info("Ollama assessment unavailable (unreachable): %s", exc)
        return OllamaAssessmentResult(text=None, status="unreachable")
    except (httpx.HTTPError, ValueError) as exc:
        logger.info("Ollama assessment unavailable: %s", exc)
        return OllamaAssessmentResult(text=None, status="error")

    text = payload.get("response")
    if not isinstance(text, str) or not text.strip():
        return OllamaAssessmentResult(text=None, status="error")
    return OllamaAssessmentResult(text=text.strip(), status="available")
