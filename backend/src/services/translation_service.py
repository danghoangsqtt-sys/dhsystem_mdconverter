"""Selection-based EN->VI translation via a local NMT model.

Formulas (`$...$`, `$$...$$`) are masked before translation and restored
verbatim afterward, so LaTeX math in a selected passage survives translation
unmodified instead of being garbled by the language model.

Markdown code spans are deliberately NOT masked here: by the time a passage
reaches this module it has already passed through the frontend's rendered-
preview text selection (`window.getSelection()`), which renders code into
`<code>`/`<pre>` HTML elements and therefore never preserves the surrounding
backtick/fence markers in the selected text — there is no backtick-delimited
"code" left to detect at this layer. A selection that is mostly code is
simply translated as plain text (lower quality, but not corrupted — nothing
is silently dropped, per this project's "never drop content silently"
principle).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import threading
from typing import TYPE_CHECKING, Any

from ..config import settings

if TYPE_CHECKING:
    from transformers import PreTrainedModel, PreTrainedTokenizerBase

logger = logging.getLogger(__name__)

_EN_PREFIX = "en: "
_VI_PREFIX = "vi: "
_MAX_TOKENS = 512

_BLOCK_FORMULA_RE = re.compile(r"\$\$.+?\$\$", re.DOTALL)
_INLINE_FORMULA_RE = re.compile(r"\$[^\n$]+?\$")
_PLACEHOLDER_RE = re.compile(r"FORMULA(\d+)")


def _mask_formulas(text: str) -> tuple[str, list[str]]:
    """Replaces $$...$$ then $...$ spans with FORMULA<i>-style placeholders.

    Plain alphanumeric placeholders were chosen empirically: the real model
    strips bracket-delimited placeholders outright (`⟦F0⟧` decodes back as
    bare `F0`) and mangles ASCII-bracket variants with a spurious inserted
    space (`[[F0]]` decodes as `[[F 0]]`), but `FORMULA0`-style tokens survive
    generation byte-for-byte — confirmed against the real loaded model, not
    just the tokenizer's encode/decode round trip.

    Block formulas are masked first so their own inner text (which may itself
    contain single `$` boundaries) can't be mistaken for a separate inline
    formula once masking proceeds to the narrower pattern.
    """
    spans: list[str] = []

    def _replace(match: re.Match[str]) -> str:
        spans.append(match.group(0))
        return f"FORMULA{len(spans) - 1}"

    text = _BLOCK_FORMULA_RE.sub(_replace, text)
    text = _INLINE_FORMULA_RE.sub(_replace, text)
    return text, spans


def _unmask_formulas(translated: str, spans: list[str]) -> str | None:
    """Restores original formula spans. None signals a fallback-worthy mismatch
    (a placeholder was dropped, duplicated, or mangled by the model).

    Uses a list (not a set) of found indices so a duplicated placeholder is
    caught too — a set would silently collapse "FORMULA0 ... FORMULA0" into a
    single 0, masking the very duplication this check exists to detect.
    """
    found = [int(m.group(1)) for m in _PLACEHOLDER_RE.finditer(translated)]
    if sorted(found) != list(range(len(spans))):
        return None
    return _PLACEHOLDER_RE.sub(lambda m: spans[int(m.group(1))], translated)


# Lazily built and cached on first translate call (unlike Docling's default
# converter, which is warmed up eagerly at startup) — translation is opt-in,
# so most sessions never need the ~1GB model in memory. Keyed by a constant
# so the pattern mirrors docling_service.py's _converter_cache exactly.
_model_cache: dict[str, tuple["PreTrainedModel", "PreTrainedTokenizerBase"]] = {}
_cache_lock = threading.Lock()


def _load_tokenizer(source: str, local_only: bool) -> "PreTrainedTokenizerBase":
    """Builds the tokenizer directly from the model's pre-built `tokenizer.json`.

    `AutoTokenizer`/`T5Tokenizer` on the installed transformers version always
    reconstructs the vocabulary from `spiece.model` instead of using a
    pre-built `tokenizer.json` when one is present, and that reconstruction
    raises `TypeError: argument 'vocab': 'dict' object cannot be converted to
    'Sequence'` for this checkpoint (a transformers/checkpoint incompatibility,
    not something fixable via `from_pretrained` kwargs). Loading the already-
    built fast tokenizer file directly sidesteps that broken path entirely.
    """
    from huggingface_hub import hf_hub_download
    from transformers import PreTrainedTokenizerFast

    def _resolve(filename: str) -> str:
        if os.path.isdir(source):
            return os.path.join(source, filename)
        return hf_hub_download(repo_id=source, filename=filename, local_files_only=local_only)

    with open(_resolve("special_tokens_map.json"), encoding="utf-8") as handle:
        special_tokens = json.load(handle)
    return PreTrainedTokenizerFast(tokenizer_file=_resolve("tokenizer.json"), **special_tokens)


def _get_model_and_tokenizer() -> tuple["PreTrainedModel", "PreTrainedTokenizerBase"]:
    with _cache_lock:
        cached = _model_cache.get("default")
        if cached is not None:
            return cached

        from transformers import AutoModelForSeq2SeqLM

        source = str(settings.translation_model_path or settings.translation_model_id)
        local_only = settings.translation_model_path is not None
        logger.info("Loading translation model from %s (local_files_only=%s)...", source, local_only)
        tokenizer = _load_tokenizer(source, local_only)
        model = AutoModelForSeq2SeqLM.from_pretrained(source, local_files_only=local_only)
        model.eval()
        _model_cache["default"] = (model, tokenizer)
        return model, tokenizer


def _strip_direction_prefix(text: str) -> str:
    """Strips the "vi: "/"en: " marker envit5-translation echoes at the start
    of its generated output (mirroring the prefix convention it expects on
    the input side) — confirmed against the real model, not documentation;
    without this, every result would show a literal "vi: " glued to the
    front of the Vietnamese text.
    """
    stripped = text.lstrip()
    for prefix in (_VI_PREFIX, _EN_PREFIX):
        if stripped.startswith(prefix):
            return stripped[len(prefix) :].lstrip()
    return stripped


def _generate(text: str) -> str:
    """Blocking inference call — callers must run this via asyncio.to_thread."""
    model, tokenizer = _get_model_and_tokenizer()
    inputs = tokenizer(_EN_PREFIX + text, return_tensors="pt", truncation=True, max_length=_MAX_TOKENS)
    outputs = model.generate(**inputs, max_length=_MAX_TOKENS)
    decoded = tokenizer.decode(outputs[0], skip_special_tokens=True)
    return _strip_direction_prefix(decoded)


async def translate_to_vietnamese(text: str) -> str:
    """Translates a selected English passage to Vietnamese.

    Formulas are masked out beforehand and restored verbatim afterward. If
    the model's output doesn't contain every placeholder intact, this falls
    back to translating the original, unmasked text once rather than
    returning a silently corrupted formula.
    """
    stripped = text.strip()
    if not stripped:
        return ""

    masked, spans = _mask_formulas(stripped)
    if spans:
        raw_output = await asyncio.to_thread(_generate, masked)
        restored = _unmask_formulas(raw_output, spans)
        if restored is not None:
            return restored
        logger.warning("Formula placeholder mismatch after translation; falling back to unmasked text.")

    return await asyncio.to_thread(_generate, stripped)
