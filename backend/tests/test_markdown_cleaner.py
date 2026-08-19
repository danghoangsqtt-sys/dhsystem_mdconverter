from __future__ import annotations

import unittest

from backend.src.services.markdown_cleaner import clean_markdown


def build_complex_table(*rows: list[str]) -> str:
    header = [f"H{i}" for i in range(1, 10)]
    lines = [
        "| " + " | ".join(header) + " |",
        "|" + "|".join("---" for _ in header) + "|",
    ]
    lines.extend("| " + " | ".join(row) + " |" for row in rows)
    return "\n".join(lines)


class MarkdownCleanerTests(unittest.TestCase):
    def test_bold_data_row_is_never_classified_as_header(self) -> None:
        bold_row = [f"**B{i}**" for i in range(1, 10)]
        normal_row = [f"N{i}" for i in range(1, 10)]
        result = clean_markdown(build_complex_table(bold_row, normal_row))
        for value in [*bold_row, *normal_row]:
            self.assertIn(value, result)

    def test_escaped_pipe_stays_in_one_cell(self) -> None:
        row = [r"A \| B", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
        result = clean_markdown(build_complex_table(row))
        self.assertIn(r"A \| B", result)
        self.assertIn("**H2:** two", result)
        self.assertIn("**H9:** nine", result)

    def test_pipe_inside_inline_code_stays_in_one_cell(self) -> None:
        row = ["`a|b`", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
        result = clean_markdown(build_complex_table(row))
        self.assertIn("`a|b`", result)
        self.assertIn("**H2:** two", result)

    def test_formula_with_html_escaped_pipe_stays_in_one_cell(self) -> None:
        # Docling's serializer HTML-escapes literal "|" inside table cells
        # before markdown_cleaner ever runs, so a formula like $|x|$ arrives
        # as "$&#124;x&#124;$" — no raw pipe reaches the row splitter.
        row = ["$&#124;x&#124;$", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
        result = clean_markdown(build_complex_table(row))
        self.assertIn("$&#124;x&#124;$", result)
        self.assertIn("**H2:** two", result)
        self.assertIn("**H9:** nine", result)

    def test_simple_table_is_preserved_when_no_cleanup_is_needed(self) -> None:
        source = "| A | B |\n|---|---|\n| one | two |"
        self.assertEqual(clean_markdown(source), source)

    def test_complex_transform_falls_back_if_content_cannot_be_preserved(self) -> None:
        # Unlabelled values still have to appear even when header cells are empty.
        header = ["H1", "", "H3", "H4", "H5", "H6", "H7", "H8", "H9"]
        row = ["one", "must-survive", "three", "four", "five", "six", "seven", "eight", "nine"]
        source = "\n".join(
            [
                "| " + " | ".join(header) + " |",
                "|" + "|".join("---" for _ in header) + "|",
                "| " + " | ".join(row) + " |",
            ]
        )
        self.assertIn("must-survive", clean_markdown(source))


if __name__ == "__main__":
    unittest.main()

