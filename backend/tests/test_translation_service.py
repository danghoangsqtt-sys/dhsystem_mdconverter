from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.src.services import translation_service


class MaskFormulasTests(unittest.TestCase):
    def test_round_trips_inline_formula(self) -> None:
        text = "Energy is given by $E=mc^2$ in relativity."
        masked, spans = translation_service._mask_formulas(text)

        self.assertNotIn("$E=mc^2$", masked)
        self.assertEqual(spans, ["$E=mc^2$"])
        self.assertEqual(translation_service._unmask_formulas(masked, spans), text)

    def test_round_trips_block_formula(self) -> None:
        text = "The result is:\n$$\\int_0^1 x^2 dx = 1/3$$\nas shown above."
        masked, spans = translation_service._mask_formulas(text)

        self.assertNotIn("$$", masked)
        self.assertEqual(spans, ["$$\\int_0^1 x^2 dx = 1/3$$"])
        self.assertEqual(translation_service._unmask_formulas(masked, spans), text)

    def test_round_trips_multiple_mixed_formulas(self) -> None:
        text = "First $a+b$ then $$c=d^2$$ and finally $e-f$."
        masked, spans = translation_service._mask_formulas(text)

        self.assertEqual(len(spans), 3)
        restored = translation_service._unmask_formulas(masked, spans)
        self.assertEqual(restored, text)

    def test_text_without_formulas_is_unchanged(self) -> None:
        text = "Plain prose with no math at all."
        masked, spans = translation_service._mask_formulas(text)

        self.assertEqual(masked, text)
        self.assertEqual(spans, [])

    def test_unmask_returns_none_when_placeholder_is_missing(self) -> None:
        _masked, spans = translation_service._mask_formulas("value $x$ here")
        corrupted_output = "gia tri o day"  # model dropped the placeholder entirely

        self.assertIsNone(translation_service._unmask_formulas(corrupted_output, spans))

    def test_unmask_returns_none_when_placeholder_is_duplicated(self) -> None:
        _masked, spans = translation_service._mask_formulas("value $x$ here")
        corrupted_output = "FORMULA0 xuat hien FORMULA0 hai lan"

        self.assertIsNone(translation_service._unmask_formulas(corrupted_output, spans))


class FormulaPlaceholderFormatTests(unittest.TestCase):
    """Regression coverage for a real bug found via live smoke test against the
    actual loaded model, not just the tokenizer's encode/decode round trip:
    bracket-delimited placeholders don't survive real generation. `⟦F0⟧` came
    back stripped down to bare `F0`, and even the ASCII `[[F0]]` variant came
    back with a spurious inserted space (`[[F 0]]`). Of 5 empirically tested
    candidates, only plain alphanumeric `FORMULA<i>` survived byte-for-byte.
    Masking must keep using this format instead of regressing to a bracketed
    one that looks fine in isolation but silently fails under real inference.
    """

    def test_masked_placeholder_is_plain_alphanumeric(self) -> None:
        masked, _spans = translation_service._mask_formulas("Energy is $E=mc^2$ here.")

        self.assertIn("FORMULA0", masked)
        self.assertNotIn("⟦", masked)
        self.assertNotIn("[[", masked)


class TranslateToVietnameseTests(unittest.IsolatedAsyncioTestCase):
    async def test_plain_text_is_passed_straight_to_generate(self) -> None:
        with patch.object(translation_service, "_generate", return_value="ban dich") as mock_generate:
            result = await translation_service.translate_to_vietnamese("hello world")

        mock_generate.assert_called_once_with("hello world")
        self.assertEqual(result, "ban dich")

    async def test_formula_is_masked_before_generate_and_restored_after(self) -> None:
        def fake_generate(masked_text: str) -> str:
            self.assertIn("FORMULA0", masked_text)
            self.assertNotIn("$E=mc^2$", masked_text)
            return "xin chao FORMULA0"

        with patch.object(translation_service, "_generate", side_effect=fake_generate):
            result = await translation_service.translate_to_vietnamese("hello $E=mc^2$")

        self.assertIn("$E=mc^2$", result)
        self.assertNotIn("⟦F0⟧", result)

    async def test_falls_back_to_unmasked_text_on_placeholder_mismatch(self) -> None:
        with patch.object(
            translation_service,
            "_generate",
            side_effect=["output missing the placeholder", "plain fallback translation"],
        ) as mock_generate:
            result = await translation_service.translate_to_vietnamese("value $x$ here")

        self.assertEqual(result, "plain fallback translation")
        self.assertEqual(mock_generate.call_count, 2)
        mock_generate.assert_called_with("value $x$ here")

    async def test_blank_text_short_circuits_without_loading_the_model(self) -> None:
        with patch.object(translation_service, "_generate") as mock_generate:
            result = await translation_service.translate_to_vietnamese("   ")

        self.assertEqual(result, "")
        mock_generate.assert_not_called()


class StripDirectionPrefixTests(unittest.TestCase):
    """Regression coverage for a real bug found via live smoke test: the
    model echoes a "vi: "/"en: " direction marker at the start of its raw
    generated output, which must not leak into the text shown to the user.
    """

    def test_strips_leading_vi_prefix(self) -> None:
        self.assertEqual(
            translation_service._strip_direction_prefix("vi: Xin chào thế giới."),
            "Xin chào thế giới.",
        )

    def test_strips_leading_en_prefix(self) -> None:
        self.assertEqual(translation_service._strip_direction_prefix("en: Hello."), "Hello.")

    def test_leaves_text_without_a_prefix_unchanged(self) -> None:
        self.assertEqual(translation_service._strip_direction_prefix("Xin chào."), "Xin chào.")

    def test_does_not_strip_a_prefix_that_only_appears_mid_string(self) -> None:
        text = "Ghi chú: vi: không phải la tiền tố đầu dòng."
        self.assertEqual(translation_service._strip_direction_prefix(text), text)


class LoadTokenizerTests(unittest.TestCase):
    """Regression coverage for a real bug: on the installed transformers
    version, `AutoTokenizer`/`T5Tokenizer` always reconstructs the vocab from
    `spiece.model` even when `tokenizer.json` is present, and that
    reconstruction raises a TypeError for this checkpoint. `_load_tokenizer`
    must keep bypassing it via `PreTrainedTokenizerFast(tokenizer_file=...)`
    instead of regressing back to `AutoTokenizer.from_pretrained`.
    """

    SPECIAL_TOKENS = {"eos_token": "</s>", "pad_token": "<pad>", "unk_token": "<unk>"}

    def test_reads_local_files_directly_when_source_is_a_directory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "special_tokens_map.json").write_text(json.dumps(self.SPECIAL_TOKENS), encoding="utf-8")
            Path(tmp, "tokenizer.json").write_text("{}", encoding="utf-8")

            with (
                patch("transformers.PreTrainedTokenizerFast") as mock_tokenizer_cls,
                patch("huggingface_hub.hf_hub_download") as mock_download,
            ):
                translation_service._load_tokenizer(tmp, local_only=True)

            mock_download.assert_not_called()
            _args, kwargs = mock_tokenizer_cls.call_args
            self.assertEqual(kwargs["tokenizer_file"], os.path.join(tmp, "tokenizer.json"))
            self.assertEqual(kwargs["eos_token"], "</s>")

    def test_downloads_from_hub_when_source_is_a_repo_id(self) -> None:
        def fake_download(*, repo_id: str, filename: str, local_files_only: bool) -> str:
            self.assertEqual(repo_id, "VietAI/envit5-translation")
            self.assertFalse(local_files_only)
            if filename == "special_tokens_map.json":
                path = os.path.join(tempfile.gettempdir(), "fake_special_tokens_map.json")
                Path(path).write_text(json.dumps(self.SPECIAL_TOKENS), encoding="utf-8")
                return path
            return f"/fake/cache/{filename}"

        with (
            patch("transformers.PreTrainedTokenizerFast") as mock_tokenizer_cls,
            patch("huggingface_hub.hf_hub_download", side_effect=fake_download) as mock_download,
        ):
            translation_service._load_tokenizer("VietAI/envit5-translation", local_only=False)

        self.assertEqual(mock_download.call_count, 2)
        _args, kwargs = mock_tokenizer_cls.call_args
        self.assertEqual(kwargs["tokenizer_file"], "/fake/cache/tokenizer.json")
        self.assertEqual(kwargs["unk_token"], "<unk>")


if __name__ == "__main__":
    unittest.main()
