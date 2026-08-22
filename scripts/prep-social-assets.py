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

DEFAULT_SRC = os.path.expanduser(r"~/OneDrive/SparkDate/SourceArt")
JPEG_QUALITY = 88


def classify(size, dims):
    """Name the shape from the actual pixels, not from the row's Format text.
    A 'Single image + Story' row legitimately carries one 1080x1080 and one
    1080x1920 file, so shape is a per-FILE property."""
    for name, d in dims.items():
        if size == (d["width"], d["height"]):
            return name
    return None



def resolve(src_dir, fname):
    """The real path for a named export, or None.

    The export folder holds names with a stray space -- "tellus-aug19-3of3
    -TL1.png" -- so an exact join misses files that are plainly sitting there.
    """
    direct = os.path.join(src_dir, fname)
    if os.path.exists(direct):
        return direct
    if not os.path.isdir(src_dir):
        return None
    loose = re.sub(r"\s+", "", fname)
    for f in os.listdir(src_dir):
        if re.sub(r"\s+", "", f) == loose:
            return os.path.join(src_dir, f)
    return None


def suffix_for(src_path, fname, dims):
    """Which surface this file is for, as a filename suffix.

    Shape alone cannot answer this any more. A TikTok image and an Instagram
    Story image are BOTH 1080x1920 -- identical pixels, different destination
    -- so the only thing that distinguishes them is what the exporter named
    it. `-tt` in the source name means TikTok; the campaign-export sheet emits
    that suffix when built with --vertical.

    Getting this wrong is quiet in the worst way: a TikTok frame filed as
    `_story` posts to Instagram Stories instead, and the TikTok row falls back
    to the square art it was meant to replace.
    """
    stem = re.sub(r"\s+", "", os.path.splitext(os.path.basename(fname))[0]).lower()
    if re.search(r"(^|[^a-z0-9])(tt|tiktok)([^a-z0-9]|$)", stem):
        return "_tt"

    if not src_path:
        return ""

    from PIL import Image
    with Image.open(src_path) as im:
        shape = classify(im.size, dims)
    return "_story" if shape in ("story", "reel") else ""


def discover(src_dir, row_id):
    """Find source files for a row that has no asset_files yet.

    The script originally only converted files the QUEUE already named, which
    worked when asset_files came pre-filled from the worksheet. New artwork
    arrives the other way round: the files land in the folder and the queue
    knows nothing about them, so every freshly designed row was skipped and
    the run reported "0 converted, 41 already prepared".

    Matches both naming shapes in use:
        GG-09_1of4.png              the row-id convention
        sparkdate-aug23-1of3-MC2.png  the older event+date exports
    """
    if not os.path.isdir(src_dir):
        return []

    m = re.match(r"^([A-Z]+)-0*(\d+)$", row_id)
    keys = {row_id.lower()}
    if m:
        keys.add((m.group(1) + m.group(2)).lower())          # MC2
        keys.add((m.group(1) + "-" + m.group(2)).lower())    # MC-2
    else:
        keys.add(row_id.replace("-", "").lower())            # MCLAUNCH

    hits = []
    for name in os.listdir(src_dir):
        if not name.lower().endswith(".png"):
            continue
        stem = re.sub(r"\s+", "", os.path.splitext(name)[0]).lower()
        # Bound the match so MC-1 does not also claim MC-10's files.
        if not any(re.search(r"(^|[^a-z0-9])" + re.escape(k) + r"([^0-9]|$)", stem) for k in keys):
            continue
        n = re.search(r"(\d+)of(\d+)", stem)
        hits.append((int(n.group(1)) if n else 1, name))

    return [name for _, name in sorted(hits)]


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
            files = discover(args.src, row["row_id"])
            if files:
                print(f"  {row['row_id']:<11} discovered {len(files)} new file(s)")
            else:
                continue

        # A row can gain a WHOLE NEW SHAPE long after its first set was
        # prepared -- which is exactly what the vertical TikTok export is.
        #
        # Discovery originally ran only when asset_files was empty, so a row
        # that already had its square carousel never looked at the folder
        # again and its `-tt` files were invisible. 17 rows were in that state
        # and the run reported "119 already prepared" while 90 new files sat
        # in SourceArt untouched.
        #
        # Compare by SHAPE rather than by filename: the question is not "is
        # this exact file known" but "does this row already have art for this
        # surface". A row with squares and no vertical set gains the vertical
        # set; a row that has both is left alone.
        have = set()
        for f in files:
            m = re.search(r"_(story|tt)\.jpg$", f, re.I)
            have.add("_" + m.group(1).lower() if m else "")

        for cand in discover(args.src, row["row_id"]):
            sp = resolve(args.src, cand)
            if not sp:
                continue
            if suffix_for(sp, cand, dims) not in have:
                files.append(cand)

        # Already prepared (a .jpg that exists in public/social) -- leave it.
        if all(f.lower().endswith(".jpg") and os.path.exists(os.path.join(OUT_DIR, f)) for f in files):
            skipped += len(files)
            continue

        rid = row["row_id"]
        new_names = []

        # Number WITHIN a shape group, not across the row.
        #
        # A row can now carry three sets at once: 4 square feed images, a
        # story frame, and 4 vertical TikTok images. Numbering them 1of9
        # through 9of9 -- which is what a single running counter does -- makes
        # every filename lie about how many slides the carousel has, and
        # buries which file belongs to which surface.
        #
        # So group first, then count. A group of one keeps the bare
        # `MC-12_story.jpg` form it already had.
        resolved = {f: resolve(args.src, f) for f in files}
        groups = {}
        for fname in files:
            if resolved[fname]:
                groups.setdefault(suffix_for(resolved[fname], fname, dims), []).append(fname)
        index = {}

        for fname in files:
            # Output from an earlier run, now sitting alongside newly
            # discovered source art. It is not in the source folder and must
            # keep both its name and its numbering -- queue.csv and the live
            # posts already reference it.
            if fname.lower().endswith(".jpg") and os.path.exists(os.path.join(OUT_DIR, fname)):
                new_names.append(fname)
                skipped += 1
                continue

            src = resolved[fname]
            if not src:
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

            suffix = suffix_for(src, fname, dims)
            total = len(groups[suffix])
            i = index[suffix] = index.get(suffix, 0) + 1
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
