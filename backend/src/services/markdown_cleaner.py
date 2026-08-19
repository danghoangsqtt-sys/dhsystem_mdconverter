"""
markdown_cleaner.py — Post-processing module for Docling markdown output.

Fixes common issues:
1. Removes empty columns from tables
2. Converts overly complex tables (>8 cols or long cells) to structured lists
3. Normalizes line breaks inside table cells
4. Cleans up trailing whitespace and pipe alignment
"""

import re
import logging

logger = logging.getLogger(__name__)


def clean_markdown(content: str) -> str:
    """
    Main entry point. Applies all cleaning passes to raw markdown content.
    """
    content = _normalize_line_endings(content)
    content = _clean_tables(content)
    content = _cleanup_whitespace(content)
    return content


def _normalize_line_endings(content: str) -> str:
    """Normalize CRLF to LF."""
    return content.replace('\r\n', '\n').replace('\r', '\n')


def _cleanup_whitespace(content: str) -> str:
    """Remove trailing whitespace on each line, collapse 3+ blank lines to 2."""
    lines = content.split('\n')
    lines = [line.rstrip() for line in lines]
    content = '\n'.join(lines)
    content = re.sub(r'\n{4,}', '\n\n\n', content)
    return content


def _split_table_row(line: str) -> list[str]:
    """Split a Markdown table row without breaking escaped pipes or code spans."""
    content = line.strip()
    if content.startswith('|'):
        content = content[1:]
    if content.endswith('|') and not content.endswith(r'\|'):
        content = content[:-1]

    cells: list[str] = []
    current: list[str] = []
    code_fence_len = 0
    i = 0
    while i < len(content):
        char = content[i]
        if char == '\\' and i + 1 < len(content):
            current.append(char)
            current.append(content[i + 1])
            i += 2
            continue
        if char == '`':
            run_end = i + 1
            while run_end < len(content) and content[run_end] == '`':
                run_end += 1
            run_len = run_end - i
            if code_fence_len == 0:
                code_fence_len = run_len
            elif code_fence_len == run_len:
                code_fence_len = 0
            current.extend(content[i:run_end])
            i = run_end
            continue
        if char == '|' and code_fence_len == 0:
            cells.append(''.join(current).strip())
            current = []
        else:
            current.append(char)
        i += 1
    cells.append(''.join(current).strip())
    return cells


def _is_separator_row(cells: list[str]) -> bool:
    return bool(cells) and all(re.fullmatch(r':?-{3,}:?', cell.strip()) for cell in cells)


def _parse_table(table_lines: list[str]) -> tuple[list[list[str] | None], int]:
    """
    Parse markdown table lines into a 2D list of cells.
    Returns (rows, separator_index).
    separator_index is the index of the |---|---| line.
    """
    rows = []
    sep_idx = -1

    for i, line in enumerate(table_lines):
        stripped = line.strip()
        if not stripped.startswith('|'):
            continue

        cells = _split_table_row(stripped)

        # The separator is the only reliable boundary between headers and data.
        if _is_separator_row(cells):
            sep_idx = i
            rows.append(None)  # placeholder for separator
            continue
        rows.append(cells)

    return rows, sep_idx


def _count_empty_columns(rows: list) -> list[bool]:
    """
    Determine which columns are completely empty (ignoring header/separator).
    Returns a list of booleans: True = column is empty across all data rows.
    """
    if not rows:
        return []

    # Find max column count
    max_cols = 0
    for row in rows:
        if row is not None:
            max_cols = max(max_cols, len(row))

    if max_cols == 0:
        return []

    # A column is empty only when it has no content in ANY row, including the
    # header. The previous logic skipped the header, so columns that had a
    # label but sparse data cells (common in DOCX merged-cell tables) were
    # incorrectly removed, stripping real content from the output.
    is_empty = [True] * max_cols
    all_rows = [r for r in rows if r is not None]

    for row in all_rows:
        for col_idx in range(min(len(row), max_cols)):
            cell = row[col_idx].strip()
            clean_cell = re.sub(r'\*\*', '', cell).strip()
            if clean_cell:
                is_empty[col_idx] = False

    return is_empty


def _is_complex_table(rows: list, max_cols: int = 8, max_cell_len: int = 200) -> bool:
    """
    Determine if a table is too complex for markdown rendering.
    Complex = too many columns OR cells with very long content.
    """
    actual_cols = 0
    for row in rows:
        if row is not None:
            actual_cols = max(actual_cols, len(row))

    if actual_cols > max_cols:
        return True

    # Check for very long cell content
    for row in rows:
        if row is None:
            continue
        for cell in row:
            if len(cell) > max_cell_len:
                return True

    return False


def _table_to_structured_list(rows: list, separator_index: int) -> str:
    """
    Convert a complex table into a readable structured list format.
    Uses header row as field names, each data row becomes a section.
    """
    header_rows = [r for r in rows[:separator_index] if r is not None]
    data_rows = [r for r in rows[separator_index + 1:] if r is not None]
    if not header_rows or not data_rows:
        return ''

    # Markdown defines rows after the separator as data. Styling such as bold
    # is content, not structural evidence, so it must never cause a row to be
    # skipped. Multiple pre-separator header rows are allowed; later headers
    # fill gaps in the first header without consuming any data row.
    header = header_rows[0]
    extra_header_rows = header_rows[1:]

    result_parts = []

    for row in data_rows:
        # Skip rows that are entirely empty
        non_empty = [c for c in row if c.strip() and re.sub(r'\*\*', '', c).strip()]
        if not non_empty:
            continue

        section_lines = []

        for col_idx, cell in enumerate(row):
            cell_content = cell.strip()
            if not cell_content or not re.sub(r'\*\*', '', cell_content).strip():
                continue

            # Get header name for this column
            header_name = header[col_idx].strip() if col_idx < len(header) else ''
            header_name = re.sub(r'\*\*', '', header_name).strip()

            # Try extra header rows if primary header is empty
            if not header_name:
                for extra_row in extra_header_rows:
                    if col_idx < len(extra_row):
                        candidate = re.sub(r'\*\*', '', extra_row[col_idx]).strip()
                        if candidate:
                            header_name = candidate
                            break

            # Skip columns with no header name at all — these are
            # artifacts from merged cells that have no meaningful label
            if not header_name:
                # Still output the content but without a label prefix
                formatted = _format_cell_content(cell_content)
                if '\n' in formatted:
                    for sub_line in formatted.split('\n'):
                        sub_line = sub_line.strip()
                        if sub_line:
                            if sub_line.startswith('-') or sub_line.startswith('+') or re.match(r'^\d+\.', sub_line):
                                section_lines.append(f"  {sub_line}")
                            else:
                                section_lines.append(f"  - {sub_line}")
                else:
                    section_lines.append(f"  - {formatted}")
                continue

            # Format cell content: replace double-space separators with line breaks
            formatted = _format_cell_content(cell_content)

            if '\n' in formatted:
                # Multi-line content → use sub-list
                section_lines.append(f"**{header_name}:**")
                for sub_line in formatted.split('\n'):
                    sub_line = sub_line.strip()
                    if sub_line:
                        # Preserve existing list markers
                        if sub_line.startswith('-') or sub_line.startswith('+') or re.match(r'^\d+\.', sub_line):
                            section_lines.append(f"  {sub_line}")
                        else:
                            section_lines.append(f"  - {sub_line}")
            else:
                section_lines.append(f"**{header_name}:** {formatted}")

        if section_lines:
            result_parts.append('\n'.join(section_lines))

    return '\n\n---\n\n'.join(result_parts)


def _semantic_cell_text(content: str) -> str:
    content = re.sub(r'\*\*|__', '', content)
    return re.sub(r'\s+', ' ', content).strip()


def _preserves_data_content(rows: list, separator_index: int, transformed: str) -> bool:
    """Conservatively prove that every non-empty data cell survived."""
    transformed_semantic = _semantic_cell_text(transformed)
    for row in rows[separator_index + 1:]:
        if row is None:
            continue
        for cell in row:
            semantic = _semantic_cell_text(cell)
            if semantic and semantic not in transformed_semantic:
                return False
    return True


def _format_cell_content(content: str) -> str:
    """
    Format cell content by converting double-space separators to newlines.
    Detects numbered patterns like '1.1', '1.1.1' to properly break content.
    """
    # Replace double-space (Docling's newline indicator) with actual newlines
    # But be careful not to break legitimate double spaces
    content = re.sub(r'  +', '\n', content)

    # Also break before numbered patterns like "1.1 ", "1.1.1 " at start
    content = re.sub(r'\n(\d+\.\d+)', r'\n\1', content)

    return content.strip()


def _remove_empty_columns(rows: list, empty_cols: list[bool]) -> list:
    """Remove columns that are completely empty from all rows."""
    new_rows = []
    for row in rows:
        if row is None:
            new_rows.append(None)
            continue
        new_row = []
        for col_idx, cell in enumerate(row):
            if col_idx < len(empty_cols) and empty_cols[col_idx]:
                continue
            new_row.append(cell)
        new_rows.append(new_row)
    return new_rows


def _rebuild_table(rows: list) -> str:
    """Rebuild a markdown table from parsed rows."""
    if not rows:
        return ''

    # Find max columns
    max_cols = 0
    for row in rows:
        if row is not None:
            max_cols = max(max_cols, len(row))

    if max_cols == 0:
        return ''

    # Calculate column widths
    col_widths = [3] * max_cols  # minimum width
    for row in rows:
        if row is None:
            continue
        for col_idx, cell in enumerate(row):
            col_widths[col_idx] = max(col_widths[col_idx], len(cell))

    lines = []
    for row in rows:
        if row is None:
            # Separator line
            sep = '|' + '|'.join(['-' * (w + 2) for w in col_widths]) + '|'
            lines.append(sep)
        else:
            # Pad cells
            padded = []
            for col_idx in range(max_cols):
                cell = row[col_idx] if col_idx < len(row) else ''
                width = col_widths[col_idx]
                padded.append(f" {cell:<{width}} ")
            lines.append('|' + '|'.join(padded) + '|')

    return '\n'.join(lines)


def _clean_tables(content: str) -> str:
    """
    Find all markdown tables in content and clean them.
    - Remove empty columns
    - Convert complex tables to structured lists
    """
    lines = content.split('\n')
    result = []
    i = 0

    while i < len(lines):
        line = lines[i].strip()

        # Detect start of a table (line starts with |)
        if line.startswith('|'):
            table_lines = []
            table_start = i

            # Collect all consecutive table lines
            while i < len(lines) and lines[i].strip().startswith('|'):
                table_lines.append(lines[i])
                i += 1

            # Process this table
            rows, sep_idx = _parse_table(table_lines)

            if not rows or sep_idx == -1:
                # Not a valid table, keep as-is
                result.extend(table_lines)
                continue

            # Check if table is too complex
            if _is_complex_table(rows):
                logger.info(f"Converting complex table (line {table_start + 1}) to structured list")
                structured = _table_to_structured_list(rows, sep_idx)
                if structured and _preserves_data_content(rows, sep_idx, structured):
                    result.append(structured)
                else:
                    # Fallback: keep original table intact — never silently drop content.
                    # The structured list conversion failed (e.g. all rows misidentified as
                    # sub-headers due to merged-cell artifacts in DOCX). Preserving the raw
                    # table is better than returning an empty string and losing data.
                    logger.warning(
                        f"Structured list conversion produced empty output for table at "
                        f"line {table_start + 1} — keeping original table."
                    )
                    result.extend(table_lines)
            else:
                # Simple table: just remove empty columns
                empty_cols = _count_empty_columns(rows)
                if any(empty_cols):
                    removed_count = sum(1 for e in empty_cols if e)
                    logger.info(f"Removed {removed_count} empty columns from table at line {table_start + 1}")
                    cleaned_rows = _remove_empty_columns(rows, empty_cols)
                    result.append(_rebuild_table(cleaned_rows))
                else:
                    # Table is fine, keep original formatting
                    result.extend(table_lines)
        else:
            result.append(lines[i])
            i += 1

    return '\n'.join(result)
