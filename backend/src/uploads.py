from __future__ import annotations

import zipfile
from pathlib import Path
from typing import BinaryIO

from fastapi import HTTPException, status

SUPPORTED_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".pptx",
    ".html",
    ".htm",
    ".png",
    ".jpg",
    ".jpeg",
    ".tif",
    ".tiff",
    ".bmp",
}
UPLOAD_CHUNK_SIZE = 1024 * 1024
CONTENT_SNIFF_BYTES = 512
# Signature bytes for formats detectable by file header alone.
_MAGIC_SIGNATURES: dict[str, tuple[bytes, ...]] = {
    ".pdf": (b"%PDF-",),
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".jpg": (b"\xff\xd8\xff",),
    ".jpeg": (b"\xff\xd8\xff",),
    ".tif": (b"II*\x00", b"MM\x00*", b"II+\x00", b"MM+\x00"),
    ".tiff": (b"II*\x00", b"MM\x00*", b"II+\x00", b"MM+\x00"),
    ".bmp": (b"BM",),
}
# docx/pptx share the OOXML zip container, so a header check alone can't tell
# them apart from each other (or from a plain zip) - the required member path
# below distinguishes the actual document type inside the archive.
_OOXML_REQUIRED_MEMBER: dict[str, str] = {
    ".docx": "word/document.xml",
    ".pptx": "ppt/presentation.xml",
}
_TEXT_EXTENSIONS = {".html", ".htm"}


class UploadTooLargeError(ValueError):
    pass


class UploadContentMismatchError(ValueError):
    pass


def _validate_uploaded_content(path: Path, extension: str) -> None:
    """Confirm the file's actual bytes match its claimed extension.

    `_safe_original_filename` only checks the filename string, which a
    mislabeled or malicious upload can trivially spoof; this inspects the
    bytes actually written to disk before they reach Docling.
    """
    signatures = _MAGIC_SIGNATURES.get(extension)
    if signatures is not None:
        with open(path, "rb") as handle:
            header = handle.read(CONTENT_SNIFF_BYTES)
        if not any(header.startswith(sig) for sig in signatures):
            raise UploadContentMismatchError(extension)
        return

    required_member = _OOXML_REQUIRED_MEMBER.get(extension)
    if required_member is not None:
        try:
            with zipfile.ZipFile(path) as archive:
                if required_member not in archive.namelist():
                    raise UploadContentMismatchError(extension)
        except zipfile.BadZipFile as exc:
            raise UploadContentMismatchError(extension) from exc
        return

    if extension in _TEXT_EXTENSIONS:
        with open(path, "rb") as handle:
            header = handle.read(CONTENT_SNIFF_BYTES)
        if b"\x00" in header:
            raise UploadContentMismatchError(extension)
        return


def _safe_original_filename(filename: str | None) -> tuple[str, str]:
    if not filename:
        raise HTTPException(status_code=400, detail="Không có tên file tải lên.")
    normalized = filename.replace("\\", "/")
    basename = normalized.rsplit("/", 1)[-1].strip()
    if not basename or len(basename) > 255:
        raise HTTPException(status_code=400, detail="Tên file không hợp lệ.")
    extension = Path(basename).suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Định dạng {extension or '(không có phần mở rộng)'} chưa được hỗ trợ.",
        )
    return basename, extension


def _copy_upload_with_limit(source: BinaryIO, destination: Path, max_bytes: int) -> int:
    destination.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    try:
        with open(destination, "wb") as output:
            while True:
                chunk = source.read(UPLOAD_CHUNK_SIZE)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise UploadTooLargeError
                output.write(chunk)
        return total
    except Exception:
        destination.unlink(missing_ok=True)
        raise
