#!/usr/bin/env python3
"""
scripts/prep-social-assets.py

Turns design exports into files the publishing APIs will actually accept, and
rewrites content/queue.csv to point at them.

Three things make this mandatory rather than cosmetic:

  1. Instagram's Content Publishing API accepts JPEG ONLY. Every source export
     is PNG. TikTok rejects PNG too. Nothing publishes without this step.
  2. The exports are RGBA. JPEG has no alpha channel, so they must be
     composited before encoding. (Checked: all 41 current files are fully
     opaque, so the composite is lossless here -- but a future export with a
     real transparent background would silently gain one otherwise.)
  3. Meta cURLs the media at publish time, so it has to sit at a public URL.
     public/ is already served statically by Vercel at sparkdate.date/social/,
     costs nothing, and -- unlike an api/ route -- does not count against the
     12-function Hobby cap the project is already at.

JPEG conversion also takes the current set from 31.5 MB to roughly 6 MB, which
is what makes committing them to the repo reasonable.

Usage:
  python scripts/prep-social-assets.py --dry-run
  python scripts/prep-social-assets.py
  python scripts/prep-social-assets.py --src "path/to/exports"
"""

import argparse
import csv
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
QUEUE = os.path.join(REPO, "content", "queue.csv")
BRAND = os.path.join(REPO, "content", "brand.json")
OUT_DIR = os.path.join(REPO, "public", "social")

DEFAULT_SRC = os.path.expanduser(r"~/Downloads/30 Day Content Plan Claude Posting")
JPEG_QUALITY = 88


def classify(size, dims):
    """Name the shape from the actual pixels, not from the row's Format text.
    A 'Single image + Story' row legitimately carries one 1080x1080 and one
    1080x1920 file, so shape is a per-FILE property."""
    for name, d in dims.items():
        if size == (d["width"], d["height"]):
            return name
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=DEFAULT_SRC)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--quality", type=int, default=JPEG_QUALITY)
    args = ap.parse_args()

    try:
        from PIL import Image
    except ImportError:
        sys.exit("ERROR: Pillow not installed. pip install Pillow")

    with open(BRAND, encoding="utf-8") as fh:
        brand = json.load(fh)
    dims = brand["asset_rules"]["dimensions"]

    with open(QUEUE, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        columns = reader.fieldnames
        rows = list(reader)

    if not args.dry_run:
        os.makedirs(OUT_DIR, exist_ok=True)

    converted = skipped = 0
    warnings = []
    total_in = total_out = 0

    for row in rows:
        files = [f.strip() for f in (row.get("asset_files") or "").split(",") if f.strip()]
        if not files:
            continue

        # Already prepared (a .jpg that exists in public/social) -- leave it.
        if all(f.lower().endswith(".jpg") and os.path.exists(os.path.join(OUT_DIR, f)) for f in files):
            skipped += len(files)
            continue

        rid = row["row_id"]
        total = len(files)
        new_names = []

        for i, fname in enumerate(files, start=1):
            src = os.path.join(args.src, fname)
            if not os.path.exists(src):
                # Tolerate the stray-space filenames in the export folder
                # (e.g. "tellus-aug19-3of3 -TL1.png") rather than assuming
                # the exports are tidily named.
                loose = re.sub(r"\s+", "", fname)
                cand = [f for f in os.listdir(args.src) if re.sub(r"\s+", "", f) == loose] \
                    if os.path.isdir(args.src) else []
                if cand:
                    src = os.path.join(args.src, cand[0])
                else:
                    warnings.append(f"{rid}: source not found: {fname}")
                    new_names.append(fname)
                    continue

            im = Image.open(src)
            shape = classify(im.size, dims)
            if shape is None:
                warnings.append(
                    f"{rid}: {fname} is {im.size[0]}x{im.size[1]}, not a known format "
                    f"({', '.join('%s %dx%d' % (k, v['width'], v['height']) for k, v in dims.items())})"
                )

            suffix = "_story" if shape in ("story", "reel") else ""
            out_name = (f"{rid}{suffix}.jpg" if total == 1
                        else f"{rid}_{i}of{total}{suffix}.jpg")
            new_names.append(out_name)
            out_path = os.path.join(OUT_DIR, out_name)

            total_in += os.path.getsize(src)
            if args.dry_run:
                print(f"  {rid:<11} {fname[:44]:<46} -> {out_name}  ({im.mode} {im.size[0]}x{im.size[1]})")
                converted += 1
                continue

            # JPEG has no alpha. Composite onto white rather than calling
            # convert('RGB'), which discards alpha by fiat and can fringe.
            if im.mode in ("RGBA", "LA", "P"):
                im = im.convert("RGBA")
                bg = Image.new("RGB", im.size, (255, 255, 255))
                bg.paste(im, mask=im.getchannel("A"))
                im = bg
            elif im.mode != "RGB":
                im = im.convert("RGB")

            im.save(out_path, "JPEG", quality=args.quality, optimize=True, progressive=True)
            total_out += os.path.getsize(out_path)
            converted += 1

        row["asset_files"] = ",".join(new_names)

    print()
    print(f"converted {converted} file(s), {skipped} already prepared")
    if total_in and total_out:
        print(f"size: {total_in/1048576:.1f} MB PNG -> {total_out/1048576:.1f} MB JPEG "
              f"({100 - total_out*100/total_in:.0f}% smaller)")
    if warnings:
        print(f"\n{len(warnings)} warning(s):")
        for w in warnings:
            print("  !", w)

    if args.dry_run:
        print("\n--dry-run: no files written, queue.csv untouched")
        return

    with open(QUEUE, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=columns, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    print(f"\nwrote {OUT_DIR} and updated queue.csv asset_files")


if __name__ == "__main__":
    main()
