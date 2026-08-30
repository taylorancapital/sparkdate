#!/usr/bin/env python3
"""
scripts/crop-photo.py

Crops a real photograph to the brand's post dimensions and writes it into
SourceArt under a row id, so the existing prep/publish pipeline can pick it up
unchanged.

WHY THIS EXISTS

Every asset in this project until now came out of Claude Design as an
already-correct PNG at exactly 1080x1080 or 1080x1920. Photography does not
arrive that way: it arrives as a 2016x1512 phone frame, in whatever aspect the
camera felt like, rotated via EXIF, and nothing in the pipeline resizes it.
prep-social-assets.py converts format -- PNG to JPEG -- it does not crop, and
its classify() will simply warn that the file is not a known format and carry
on. So a photo dropped into SourceArt reaches Instagram at the wrong aspect.

scripts/design-handoff.js already draws this line correctly: it lists the
live-capture rows under "Not for you -- photography" and reports zero slides to
build. This is the tool for the other side of that line.

TWO THINGS IT REFUSES TO DO, BOTH DELIBERATE

  1. It never upscales. If the source cannot fill the target at native
     resolution the crop is refused, not stretched. A soft 1080px post is worse
     than no post, and it is the kind of quality loss nobody notices until it
     is published.

  2. It does not guess where the subject is. Centre is the default because it
     is predictable, not because it is right -- on a photo whose subject sits
     off to one side, centre will cut them in half. Use --anchor, look at the
     output, and adjust. The script cannot see the picture.

EXIF ORIENTATION IS APPLIED FIRST. Phone cameras store a portrait shot as
landscape pixels plus a "rotate 90" tag, PIL does not apply it on open, and
saving drops the tag -- so an untransposed crop is both the wrong region AND
sideways, with no metadata left to signal it. Same trap as prep-social-assets.py
(fixed 2026-08-29).

Usage:
  python scripts/crop-photo.py --src photo.jpg --row TL-08 --format feed
  python scripts/crop-photo.py --src photo.jpg --row TL-08 --format feed,story
  python scripts/crop-photo.py --src photo.jpg --row TL-08 --format feed \\
      --anchor right --dry-run
"""

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
BRAND = os.path.join(REPO, "content", "brand.json")
DEFAULT_OUT = os.path.expanduser(r"~/OneDrive/SparkDate/SourceArt")

# Where the crop window sits inside the source, as a fraction of the leftover
# space. 0.0 = flush to the near edge, 1.0 = flush to the far edge.
ANCHORS = {
    "center": (0.5, 0.5),
    "left": (0.0, 0.5),
    "right": (1.0, 0.5),
    "top": (0.5, 0.0),
    "bottom": (0.5, 1.0),
    "top-left": (0.0, 0.0),
    "top-right": (1.0, 0.0),
    "bottom-left": (0.0, 1.0),
    "bottom-right": (1.0, 1.0),
}


def crop_box(src_w, src_h, target_w, target_h, ax, ay):
    """The largest region of the target's aspect that fits inside the source."""
    target_ratio = target_w / target_h
    if src_w / src_h > target_ratio:
        # Source is wider than the target: full height, trim the sides.
        crop_h = src_h
        crop_w = round(src_h * target_ratio)
    else:
        # Source is taller: full width, trim top and bottom.
        crop_w = src_w
        crop_h = round(src_w / target_ratio)
    left = round((src_w - crop_w) * ax)
    top = round((src_h - crop_h) * ay)
    return (left, top, left + crop_w, top + crop_h)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="source photograph")
    ap.add_argument("--row", required=True, help="row id, e.g. TL-08")
    ap.add_argument("--format", default="feed",
                    help="comma-separated: feed, story, reel (from brand.json)")
    ap.add_argument("--anchor", default="center",
                    help="crop anchor: " + ", ".join(ANCHORS) + ", or x,y as 0-1 floats")
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--suffix", default="", help="extra name part, e.g. 1of3")
    ap.add_argument("--quality", type=int, default=92)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    try:
        from PIL import Image, ImageOps
    except ImportError:
        sys.exit("ERROR: Pillow not installed. pip install Pillow")

    if not os.path.exists(args.src):
        sys.exit(f"ERROR: no such file: {args.src}")

    with open(BRAND, encoding="utf-8") as fh:
        dims = json.load(fh)["asset_rules"]["dimensions"]

    if "," in args.anchor:
        try:
            ax, ay = (float(v) for v in args.anchor.split(",", 1))
        except ValueError:
            sys.exit(f"ERROR: --anchor '{args.anchor}' is neither a name nor x,y floats")
    elif args.anchor in ANCHORS:
        ax, ay = ANCHORS[args.anchor]
    else:
        sys.exit(f"ERROR: unknown anchor '{args.anchor}'. Known: {', '.join(ANCHORS)}")

    wanted = [f.strip() for f in args.format.split(",") if f.strip()]
    for f in wanted:
        if f not in dims:
            sys.exit(f"ERROR: unknown format '{f}'. brand.json knows: {', '.join(dims)}")

    with Image.open(args.src) as raw:
        # Before anything else -- see the module docstring.
        im = ImageOps.exif_transpose(raw)
        src_w, src_h = im.size
        print(f"source : {os.path.basename(args.src)}  {src_w}x{src_h}"
              f"  (EXIF applied: {'yes' if im.size != raw.size else 'no rotation needed'})")
        print(f"anchor : {args.anchor}  -> ({ax}, {ay})")
        print()

        failed = False
        for fmt in wanted:
            tw, th = dims[fmt]["width"], dims[fmt]["height"]
            box = crop_box(src_w, src_h, tw, th, ax, ay)
            cw, ch = box[2] - box[0], box[3] - box[1]

            if cw < tw or ch < th:
                print(f"  {fmt:6s} {tw}x{th}  REFUSED -- source gives only {cw}x{ch}, "
                      f"which would upscale by {max(tw / cw, th / ch):.2f}x")
                failed = True
                continue

            part = f"_{args.suffix}" if args.suffix else ""
            sub = "" if fmt == "feed" else f"_{fmt}"
            name = f"{args.row}{sub}{part}.jpg"
            dest = os.path.join(args.out, name)

            print(f"  {fmt:6s} {tw}x{th}  crop {cw}x{ch} at ({box[0]},{box[1]})"
                  f"  ->  {name}"
                  f"{'  [dry run]' if args.dry_run else ''}")

            if not args.dry_run:
                os.makedirs(args.out, exist_ok=True)
                out = im.crop(box).resize((tw, th), Image.LANCZOS)
                if out.mode != "RGB":
                    out = out.convert("RGB")
                out.save(dest, "JPEG", quality=args.quality, optimize=True, progressive=True)

        print()
        if failed:
            print("One or more formats were refused rather than upscaled.")
        if args.dry_run:
            print("Dry run. Re-run without --dry-run to write.")
        else:
            names = [f"{args.row}{'' if f == 'feed' else '_' + f}"
                     f"{('_' + args.suffix) if args.suffix else ''}.jpg" for f in wanted]
            print("Set asset_files on the queue row to: " + ",".join(names))
            print("Then: npm run social:prep   (converts and copies into public/social/)")


if __name__ == "__main__":
    main()
