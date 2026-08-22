#!/usr/bin/env python3
"""
scripts/build-tiktok-video.py

Turns a queue row's carousel frames into a vertical TikTok slideshow video.

WHY THIS IS A SCRIPT AND NOT A DESIGN HANDOFF
---------------------------------------------
Claude Design renders HTML and exports PNG. It has no video output, so there
is nothing to hand it here -- and routing this through it anyway is how the
slides kept drifting off-brand. Design's job ends at the frames. The frames
already exist. Assembling them is a build step, and a build step should be
deterministic: same row in, same video out, no re-review.

WHY THE FILES DO NOT GO IN THE REPO
------------------------------------
Video is one to two orders of magnitude larger than the JPEGs. `public/social`
holds 119 images in ~6 MB; a single 30-second 1080x1920 clip is comparable to
all of them. Git never forgets a binary, so these are written to SourceArt on
OneDrive and stay there.

That has a consequence worth knowing BEFORE the first one is made: the TikTok
publisher currently uses PULL_FROM_URL, which means TikTok fetches the media
from a public address. A file that only exists in OneDrive has no such
address. Posting these needs the FILE_UPLOAD path (init -> PUT the bytes,
chunked above 64 MB), which is not built yet. Until it is, these are made here
and uploaded by hand in the app -- which is also where the trending sound gets
picked, and on TikTok the sound matters more than the slides.

FRAMES
------
Prefers the vertical set (`*-tt.png`, from `build-campaign-export --vertical`).
Falls back to the square carousel art, centred on the brand navy at 1080x1920
rather than letterboxed black -- a fallback that looks deliberate instead of
broken, and which means video works before the vertical export is done.

Usage:
  python scripts/build-tiktok-video.py --row=GG-09
  python scripts/build-tiktok-video.py --all --dry-run
  python scripts/build-tiktok-video.py --all --seconds=3.5
"""

import argparse
import csv
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
QUEUE = os.path.join(REPO, "content", "queue.csv")
PREPARED = os.path.join(REPO, "public", "social")

DEFAULT_SRC = os.path.expanduser(r"~/OneDrive/SparkDate/SourceArt")
DEFAULT_OUT = os.path.expanduser(r"~/OneDrive/SparkDate/SourceArt/Video")

W, H = 1080, 1920
FPS = 30
NAVY = "0x0a0e27"          # the brand background, matching the frames
XFADE = 0.5                # seconds of crossfade between slides
TOP_BIAS = 0.25            # where a short frame sits vertically; see build_filter


def ffmpeg_exe():
    """Find an encoder without demanding a system install.

    A PATH ffmpeg wins if there is one. Otherwise imageio-ffmpeg ships its own
    binary inside the Python environment, which keeps this off the machine's
    PATH and makes it removable with one pip command.
    """
    from shutil import which
    found = which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        sys.exit(
            "No ffmpeg found.\n"
            "  pip install imageio-ffmpeg      (self-contained, no system change)\n"
            "  winget install ffmpeg           (system-wide, if you want it on PATH)"
        )


def frames_for(row, src_dir):
    """The images this video is built from, in slide order.

    Returns (paths, source_label). Vertical art wins; the squares are the
    fallback so a row that has art can produce a video today.
    """
    rid = row["row_id"]

    def sort_key(name):
        n = re.search(r"(\d+)of(\d+)", name.lower())
        return (int(n.group(1)) if n else 1, name.lower())

    # 1. The vertical export, named `...-1of4-tt.png` by the TikTok sheet.
    if os.path.isdir(src_dir):
        vertical = [
            f for f in os.listdir(src_dir)
            if f.lower().endswith((".png", ".jpg"))
            and re.search(r"(^|[^a-z0-9])" + re.escape(rid.lower()) + r"([^0-9]|$)",
                          re.sub(r"\s+", "", os.path.splitext(f)[0]).lower())
            and re.search(r"(^|[^a-z0-9])(tt|tiktok)([^a-z0-9]|$)",
                          re.sub(r"\s+", "", os.path.splitext(f)[0]).lower())
        ]
        if vertical:
            return [os.path.join(src_dir, f) for f in sorted(vertical, key=sort_key)], "vertical"

    # 2. The prepared square carousel -- already JPEG, already ordered.
    files = [f.strip() for f in (row.get("asset_files") or "").split(",") if f.strip()]
    square = [os.path.join(PREPARED, f) for f in files
              if not re.search(r"_(story|tt)\.", f, re.I)]
    square = [p for p in square if os.path.exists(p)]
    if square:
        return square, "square"

    return [], "none"


def build_filter(n, seconds):
    """The ffmpeg filtergraph: fit each frame, then crossfade the chain.

    Each input is scaled to fit inside 1080x1920 and padded onto the brand
    navy -- `decrease` never crops, so a square frame keeps all of its content
    and gains bands above and below in the brand colour rather than black.

    The padding is TOP-WEIGHTED, not centred, and that is the whole point of
    the fallback. Centring a 1080x1080 frame leaves 420px of navy below it,
    which is less than the ~500px TikTok draws its username and caption over
    -- so the bottom of the artwork, where the SparkDate mark sits, ends up
    underneath the caption. At 25% the square sits high enough to clear it.
    A frame that is already 1080x1920 pads by zero either way, so this costs
    the vertical set nothing.

    It does not solve everything: TikTok's action rail still overlays the
    right edge of a full-width square. That is why the `-tt` export exists --
    those frames reserve the rail properly. This makes the stopgap look
    deliberate; it does not make it correct.

    Crossfades are chained pairwise because xfade takes exactly two inputs.
    Each fade overlaps the previous segment by XFADE seconds, so the offsets
    accumulate rather than sitting on multiples of `seconds` -- getting that
    wrong silently drops the tail of every slide after the first.
    """
    parts = []
    for i in range(n):
        parts.append(
            f"[{i}:v]scale={W}:{H}:force_original_aspect_ratio=decrease,"
            f"pad={W}:{H}:(ow-iw)/2:(oh-ih)*{TOP_BIAS}:color={NAVY},"
            f"setsar=1,fps={FPS},format=yuv420p[v{i}]"
        )

    if n == 1:
        return ";".join(parts), "[v0]"

    prev, offset = "[v0]", seconds - XFADE
    for i in range(1, n):
        out = f"[x{i}]"
        parts.append(
            f"{prev}[v{i}]xfade=transition=fade:duration={XFADE}:offset={offset:.3f}{out}"
        )
        prev = out
        offset += seconds - XFADE
    return ";".join(parts), prev


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--row", help="one row id, e.g. GG-09")
    ap.add_argument("--all", action="store_true", help="every row that posts to TikTok")
    ap.add_argument("--src", default=DEFAULT_SRC)
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--seconds", type=float, default=3.0, help="seconds per slide")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not args.row and not args.all:
        sys.exit("Specify --row=GG-09 or --all.")

    with open(QUEUE, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))

    if args.row:
        wanted = [r for r in rows if r["row_id"] == args.row]
        if not wanted:
            sys.exit(f"No row {args.row} in content/queue.csv")
    else:
        wanted = [r for r in rows
                  if "tiktok" in [p.strip() for p in (r.get("platforms") or "").split(",")]]

    if not args.dry_run:
        os.makedirs(args.out, exist_ok=True)
    exe = ffmpeg_exe()

    made = skipped = 0
    for row in wanted:
        rid = row["row_id"]
        paths, kind = frames_for(row, args.src)

        if not paths:
            print(f"  {rid:<11} SKIP  no frames yet")
            skipped += 1
            continue
        if kind == "square":
            # Not an error -- it produces a real video. But it is the reason
            # to finish the vertical export, so say so every time.
            print(f"  {rid:<11} using SQUARE art ({len(paths)}) -- export the -tt set for full-bleed")

        dest = os.path.join(args.out, f"{rid}.mp4")
        total = args.seconds * len(paths) - XFADE * (len(paths) - 1)
        fchain, last = build_filter(len(paths), args.seconds)

        cmd = [exe, "-y"]
        for p in paths:
            cmd += ["-loop", "1", "-t", str(args.seconds), "-i", p]
        cmd += [
            "-filter_complex", fchain,
            "-map", last,
            "-c:v", "libx264", "-preset", "medium", "-crf", "20",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            "-r", str(FPS), dest,
        ]

        if args.dry_run:
            print(f"  {rid:<11} would write {os.path.basename(dest)}  "
                  f"{len(paths)} slides, {total:.1f}s, {kind}")
            made += 1
            continue

        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            tail = (res.stderr or "").strip().splitlines()[-3:]
            print(f"  {rid:<11} FAILED: {' | '.join(tail)}")
            skipped += 1
            continue

        size = os.path.getsize(dest) / 1048576
        print(f"  {rid:<11} {os.path.basename(dest)}  "
              f"{len(paths)} slides, {total:.1f}s, {size:.1f} MB  [{kind}]")
        made += 1

    print()
    print(f"{made} video(s), {skipped} skipped")
    if args.dry_run:
        print("--dry-run: nothing written")
        return

    print(f"\nIn {args.out}")
    print("\nPosting, until FILE_UPLOAD exists: open TikTok, upload the MP4, add a")
    print("trending sound, and paste the caption. The caption for each row is in")
    print("content/queue.csv (`caption_x` is the short one TikTok's 150-char title")
    print("takes). Sound matters more than the slides here -- pick it in the app,")
    print("where you can hear what is currently working.")


if __name__ == "__main__":
    main()
