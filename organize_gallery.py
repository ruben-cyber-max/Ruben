#!/usr/bin/env python3
"""
Organize a phone gallery (tuned for Samsung Galaxy file naming).

Sorts photos and videos into folders by type and date, and sets exact
duplicates aside. Nothing is ever deleted.

    python organize_gallery.py SOURCE DEST            # preview only (dry run)
    python organize_gallery.py SOURCE DEST --apply    # copy files into DEST
    python organize_gallery.py SOURCE DEST --apply --move   # move instead of copy

Output layout:
    DEST/
      Photos/2024/2024-03/...
      Videos/2024/2024-03/...
      Screenshots/2024/...
      Screen recordings/2024/...
      WhatsApp/Images/2024/...   WhatsApp/Videos/2024/...
      Duplicates/...            (exact copies of a file already sorted)
      Other/...                 (no date could be found)

Dates come from, in order: photo EXIF data (if Pillow is installed),
the Samsung / WhatsApp file name, then the file's modified time.
Only the Python standard library is required; `pip install pillow` is optional.
"""

import argparse
import hashlib
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

PHOTO_EXT = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".gif", ".bmp", ".dng"}
VIDEO_EXT = {".mp4", ".mov", ".3gp", ".mkv", ".avi", ".webm", ".m4v"}

# Samsung camera:      20240315_142233.jpg
# Samsung screenshot:  Screenshot_20240315-142233_WhatsApp.jpg
# Screen recording:    Screen_Recording_20240315-142233_Chrome.mp4
# WhatsApp:            IMG-20240315-WA0012.jpg / VID-20240315-WA0003.mp4
DATE_PATTERNS = [
    re.compile(r"(?P<y>20\d{2})(?P<m>\d{2})(?P<d>\d{2})[_-](?P<H>\d{2})(?P<M>\d{2})(?P<S>\d{2})"),
    re.compile(r"(?P<y>20\d{2})-(?P<m>\d{2})-(?P<d>\d{2})[ _-](?P<H>\d{2})[.\-:](?P<M>\d{2})[.\-:](?P<S>\d{2})"),
    re.compile(r"(?P<y>20\d{2})(?P<m>\d{2})(?P<d>\d{2})"),
    re.compile(r"(?P<y>20\d{2})-(?P<m>\d{2})-(?P<d>\d{2})"),
]

try:
    from PIL import Image  # optional

    try:
        from pillow_heif import register_heif_opener  # optional, for .heic

        register_heif_opener()
    except ImportError:
        pass
except ImportError:
    Image = None


def exif_date(path: Path):
    if Image is None or path.suffix.lower() not in PHOTO_EXT:
        return None
    try:
        with Image.open(path) as img:
            exif = img.getexif()
            # 36867 DateTimeOriginal (in Exif IFD), 306 DateTime
            value = exif.get_ifd(0x8769).get(36867) or exif.get(306)
        if value:
            return datetime.strptime(str(value).strip()[:19], "%Y:%m:%d %H:%M:%S")
    except Exception:
        pass
    return None


def filename_date(name: str):
    for pattern in DATE_PATTERNS:
        match = pattern.search(name)
        if not match:
            continue
        parts = {k: int(v) for k, v in match.groupdict().items()}
        try:
            dt = datetime(parts["y"], parts["m"], parts["d"],
                          parts.get("H", 0), parts.get("M", 0), parts.get("S", 0))
        except ValueError:
            continue
        if 2000 <= dt.year <= datetime.now().year + 1:
            return dt
    return None


def file_date(path: Path):
    dt = exif_date(path) or filename_date(path.name)
    if dt:
        return dt, True
    try:
        return datetime.fromtimestamp(path.stat().st_mtime), False
    except OSError:
        return None, False


def category(path: Path):
    name = path.name.lower()
    parts = [p.lower() for p in path.parts]
    ext = path.suffix.lower()
    is_video = ext in VIDEO_EXT

    if "whatsapp" in name or re.search(r"-wa\d{4}", name) or any("whatsapp" in p for p in parts):
        return "WhatsApp/Videos" if is_video else "WhatsApp/Images"
    if name.startswith("screen_recording") or "screen recordings" in parts:
        return "Screen recordings"
    if name.startswith("screenshot") or "screenshots" in parts:
        return "Screenshots"
    return "Videos" if is_video else "Photos"


def file_hash(path: Path):
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def unique_target(target: Path, reserved: set):
    candidate, n = target, 1
    while candidate.exists() or candidate in reserved:
        candidate = target.with_name(f"{target.stem}_{n}{target.suffix}")
        n += 1
    reserved.add(candidate)
    return candidate


def main():
    parser = argparse.ArgumentParser(description="Organize a phone photo gallery.")
    parser.add_argument("source", type=Path, help="folder copied from the phone (e.g. DCIM)")
    parser.add_argument("dest", type=Path, help="folder to put the organized gallery in")
    parser.add_argument("--apply", action="store_true", help="actually copy/move files (default: preview only)")
    parser.add_argument("--move", action="store_true", help="move files instead of copying them")
    parser.add_argument("--keep-duplicates", action="store_true",
                        help="sort duplicates like other files instead of putting them in Duplicates/")
    args = parser.parse_args()

    source, dest = args.source.resolve(), args.dest.resolve()
    if not source.is_dir():
        sys.exit(f"Source folder not found: {source}")
    if dest == source or source in dest.parents:
        sys.exit("DEST must not be inside SOURCE.")

    files = sorted(
        p for p in source.rglob("*")
        if p.is_file()
        and p.suffix.lower() in PHOTO_EXT | VIDEO_EXT
        and not p.name.startswith(".")
        and ".thumbnails" not in p.parts
        and ".trashed" not in p.name.lower()
    )
    if not files:
        sys.exit("No photos or videos found.")

    seen_hashes = {}
    reserved = set()
    counts = {}
    action = shutil.move if args.move else shutil.copy2
    verb = "MOVE" if args.move else "COPY"

    for i, path in enumerate(files, 1):
        dt, _ = file_date(path)
        cat = category(path)

        digest = None if args.keep_duplicates else file_hash(path)
        if digest and digest in seen_hashes:
            folder = dest / "Duplicates"
            label = "Duplicates"
        elif dt is None:
            folder = dest / "Other"
            label = "Other"
        else:
            folder = dest / cat / f"{dt:%Y}"
            if cat in ("Photos", "Videos"):
                folder = folder / f"{dt:%Y-%m}"
            label = cat
        if digest and digest not in seen_hashes:
            seen_hashes[digest] = path

        target = unique_target(folder / path.name, reserved)
        counts[label] = counts.get(label, 0) + 1

        rel_src = path.relative_to(source)
        rel_dst = target.relative_to(dest)
        print(f"[{i}/{len(files)}] {verb if args.apply else 'PLAN'} {rel_src} -> {rel_dst}")

        if args.apply:
            target.parent.mkdir(parents=True, exist_ok=True)
            action(str(path), str(target))

    print("\nSummary:")
    for label, n in sorted(counts.items()):
        print(f"  {label:<20} {n}")
    print(f"  {'Total':<20} {len(files)}")
    if not args.apply:
        print("\nThis was a preview. Run again with --apply to copy the files.")
    if Image is None:
        print("Tip: `pip install pillow` lets the script read the date stored inside each photo.")


if __name__ == "__main__":
    main()
