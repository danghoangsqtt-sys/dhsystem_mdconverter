from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

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


class MaskTermsTests(unittest.TestCase):
    GLOSSARY: list[tuple[str, str]] = [
        ("neural network", "mạng nơ-ron"),
        ("network", "mạng"),
    ]

    def test_masks_longer_phrase_before_shorter_substring_en_to_vi(self) -> None:
        text = "A neural network is powerful."
        masked, targets = translation_service._mask_terms(text, self.GLOSSARY, "en_vi")

        self.assertIn("TERM0", masked)
        self.assertNotIn("neural network", masked.lower())
        self.assertEqual(targets, ["mạng nơ-ron"])

    def test_matches_case_insensitively(self) -> None:
        text = "Neural Network models are common."
        masked, targets = translation_service._mask_terms(text, self.GLOSSARY, "en_vi")

        self.assertIn("TERM0", masked)
        self.assertEqual(targets, ["mạng nơ-ron"])

    def test_does_not_match_inside_a_longer_word(self) -> None:
        text = "We are networking the servers."
        masked, targets = translation_service._mask_terms(text, self.GLOSSARY, "en_vi")

        self.assertNotIn("TERM", masked)
        self.assertEqual(targets, [])

    def test_uses_vietnamese_side_as_source_when_direction_is_vi_en(self) -> None:
        text = "Mo hinh dung mạng nơ-ron sau."
        masked, targets = translation_service._mask_terms(text, self.GLOSSARY, "vi_en")

        self.assertIn("TERM0", masked)
        self.assertNotIn("mạng nơ-ron", masked)
        self.assertEqual(targets, ["neural network"])

    def test_text_without_known_terms_is_unchanged(self) -> None:
        text = "Nothing technical in this sentence."
        masked, targets = translation_service._mask_terms(text, self.GLOSSARY, "en_vi")

        self.assertEqual(masked, text)
        self.assertEqual(targets, [])


class UnmaskTermsTests(unittest.TestCase):
    def test_restores_target_terms_in_order(self) -> None:
        translated = "A TERM0 la mot loai TERM1."

        result = translation_service._unmask_terms(translated, ["mạng nơ-ron", "thuật toán"])

        self.assertEqual(result, "A mạng nơ-ron la mot loai thuật toán.")

    def test_returns_none_when_placeholder_is_missing(self) -> None:
        result = translation_service._unmask_terms("khong co placeholder", ["mạng nơ-ron"])

        self.assertIsNone(result)

    def test_returns_none_when_placeholder_is_duplicated(self) -> None:
        result = translation_service._unmask_terms("TERM0 va TERM0", ["mạng nơ-ron"])

        self.assertIsNone(result)

    def test_is_a_noop_when_there_are_no_targets(self) -> None:
        result = translation_service._unmask_terms("plain text, no terms", [])

        self.assertEqual(result, "plain text, no terms")


class GenerateDirectionTests(unittest.TestCase):
    """`_generate` must select the prefix matching the *source* language
    instead of hardcoding English — this is the concrete mechanism that
    enables VI->EN, not just EN->VI.
    """

    def _fake_model_and_tokenizer(self, decoded: str) -> tuple[MagicMock, MagicMock]:
        fake_tokenizer = MagicMock(return_value={"input_ids": [1]})
        fake_tokenizer.decode.return_value = decoded
        fake_model = MagicMock()
        fake_model.generate.return_value = ["ids"]
        return fake_model, fake_tokenizer

    def test_uses_en_prefix_for_en_vi_direction(self) -> None:
        fake_model, fake_tokenizer = self._fake_model_and_tokenizer("vi: xin chao")
        with patch.object(
            translation_service, "_get_model_and_tokenizer", return_value=(fake_model, fake_tokenizer)
        ):
            translation_service._generate("hello", "en_vi")

        called_text = fake_tokenizer.call_args[0][0]
        self.assertEqual(called_text, "en: hello")

    def test_uses_vi_prefix_for_vi_en_direction(self) -> None:
        fake_model, fake_tokenizer = self._fake_model_and_tokenizer("en: hello")
        with patch.object(
            translation_service, "_get_model_and_tokenizer", return_value=(fake_model, fake_tokenizer)
        ):
            translation_service._generate("xin chao", "vi_en")

        called_text = fake_tokenizer.call_args[0][0]
        self.assertEqual(called_text, "vi: xin chao")


class TranslateTextTests(unittest.IsolatedAsyncioTestCase):
    async def test_plain_text_is_passed_straight_to_generate(self) -> None:
        with patch.object(translation_service, "_generate", return_value="ban dich") as mock_generate:
            result = await translation_service.translate_text("hello world")

        mock_generate.assert_called_once_with("hello world", "en_vi")
        self.assertEqual(result, "ban dich")

    async def test_formula_is_masked_before_generate_and_restored_after(self) -> None:
        def fake_generate(masked_text: str, _direction: str) -> str:
            self.assertIn("FORMULA0", masked_text)
            self.assertNotIn("$E=mc^2$", masked_text)
            return "xin chao FORMULA0"

        with patch.object(translation_service, "_generate", side_effect=fake_generate):
            result = await translation_service.translate_text("hello $E=mc^2$")

        self.assertIn("$E=mc^2$", result)
        self.assertNotIn("⟦F0⟧", result)

    async def test_falls_back_to_unmasked_text_on_placeholder_mismatch(self) -> None:
        with patch.object(
            translation_service,
            "_generate",
            side_effect=["output missing the placeholder", "plain fallback translation"],
        ) as mock_generate:
            result = await translation_service.translate_text("value $x$ here")

        self.assertEqual(result, "plain fallback translation")
        self.assertEqual(mock_generate.call_count, 2)
        mock_generate.assert_called_with("value $x$ here", "en_vi")

    async def test_blank_text_short_circuits_without_loading_the_model(self) -> None:
        with patch.object(translation_service, "_generate") as mock_generate:
            result = await translation_service.translate_text("   ")

        self.assertEqual(result, "")
        mock_generate.assert_not_called()

    async def test_vi_en_direction_is_forwarded_to_generate(self) -> None:
        with patch.object(translation_service, "_generate", return_value="hello") as mock_generate:
            result = await translation_service.translate_text("xin chao", direction="vi_en")

        mock_generate.assert_called_once_with("xin chao", "vi_en")
        self.assertEqual(result, "hello")

    async def test_unknown_direction_raises_value_error_without_loading_the_model(self) -> None:
        with patch.object(translation_service, "_generate") as mock_generate:
            with self.assertRaises(ValueError):
                await translation_service.translate_text("hello", direction="fr_vi")

        mock_generate.assert_not_called()


class TranslateTextDomainTests(unittest.IsolatedAsyncioTestCase):
    """Domain-glossary integration at the translate_text level — the glossary
    data itself lives in translation_glossaries.py and is swapped out here so
    these tests stay stable regardless of how that curated list evolves.
    """

    FAKE_DOMAIN = "test_domain"
    FAKE_GLOSSARY: list[tuple[str, str]] = [("neural network", "mang no-ron")]

    async def test_domain_term_is_forced_to_glossary_translation(self) -> None:
        def fake_generate(masked_text: str, _direction: str) -> str:
            self.assertIn("TERM0", masked_text)
            self.assertNotIn("neural network", masked_text)
            return "day la TERM0 manh me"

        with (
            patch.object(translation_service, "DOMAINS", {self.FAKE_DOMAIN: self.FAKE_GLOSSARY}),
            patch.object(translation_service, "_generate", side_effect=fake_generate),
        ):
            result = await translation_service.translate_text(
                "This neural network is powerful", domain=self.FAKE_DOMAIN
            )

        self.assertEqual(result, "day la mang no-ron manh me")

    async def test_unrecognized_domain_is_treated_as_no_domain(self) -> None:
        with (
            patch.object(translation_service, "DOMAINS", {self.FAKE_DOMAIN: self.FAKE_GLOSSARY}),
            patch.object(translation_service, "_generate", return_value="ban dich") as mock_generate,
        ):
            result = await translation_service.translate_text("hello", domain="does_not_exist")

        mock_generate.assert_called_once_with("hello", "en_vi")
        self.assertEqual(result, "ban dich")

    async def test_no_domain_skips_glossary_even_if_text_contains_a_known_term(self) -> None:
        with (
            patch.object(translation_service, "DOMAINS", {self.FAKE_DOMAIN: self.FAKE_GLOSSARY}),
            patch.object(translation_service, "_generate", return_value="ban dich") as mock_generate,
        ):
            result = await translation_service.translate_text("neural network here")

        mock_generate.assert_called_once_with("neural network here", "en_vi")
        self.assertEqual(result, "ban dich")

    async def test_falls_back_when_term_placeholder_is_dropped(self) -> None:
        with (
            patch.object(translation_service, "DOMAINS", {self.FAKE_DOMAIN: self.FAKE_GLOSSARY}),
            patch.object(
                translation_service,
                "_generate",
                side_effect=["output missing the term placeholder", "plain fallback translation"],
            ) as mock_generate,
        ):
            result = await translation_service.translate_text(
                "This neural network is powerful", domain=self.FAKE_DOMAIN
            )

        self.assertEqual(result, "plain fallback translation")
        self.assertEqual(mock_generate.call_count, 2)


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
