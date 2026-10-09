#!/usr/bin/env python3
"""Regenerate Android launcher icons in packages/mobile/src-tauri/icons/android.

Why this exists: an adaptive icon's foreground is a 108dp canvas, but the
launcher only shows the centre 72dp (the rest is reserved for parallax and is
cropped by the mask). The master icon is already a full app tile with its own
white padding, so it is placed exactly over that 72dp viewport — the visible
icon then matches the web/desktop tile. Filling the whole 108dp canvas instead
zooms the artwork 1.5x and the mask cuts into it. The background color (#fff,
see values/ic_launcher_background.xml) fills the margin and the master's
transparent corners, so launcher masks (circle/squircle) only ever crop white.

Usage: python3 scripts/generate-android-icons.py  (requires Pillow)
After running, sync into the generated Android project with:
    node scripts/sync-android-icons.mjs
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "packages/frontend/public/icon.png"
OUT = ROOT / "packages/mobile/src-tauri/icons/android"

# density -> (foreground canvas px, launcher px)
DENSITIES = {
    "mdpi": (108, 48),
    "hdpi": (162, 72),
    "xhdpi": (216, 96),
    "xxhdpi": (324, 144),
    "xxxhdpi": (432, 192),
}


def main() -> None:
    master = Image.open(MASTER).convert("RGBA")

    for density, (fg_px, launcher_px) in DENSITIES.items():
        out_dir = OUT / f"mipmap-{density}"
        out_dir.mkdir(parents=True, exist_ok=True)

        # Adaptive foreground: artwork covers the visible 72dp of the 108dp canvas.
        art_px = fg_px * 72 // 108
        offset = (fg_px - art_px) // 2
        fg = Image.new("RGBA", (fg_px, fg_px), (0, 0, 0, 0))
        fg.alpha_composite(master.resize((art_px, art_px), Image.LANCZOS), (offset, offset))
        fg.save(out_dir / "ic_launcher_foreground.png")

        # Legacy square icon: full-bleed artwork on white.
        square = Image.new("RGBA", (launcher_px, launcher_px), (255, 255, 255, 255))
        square.alpha_composite(master.resize((launcher_px, launcher_px), Image.LANCZOS))
        square.save(out_dir / "ic_launcher.png")

        # Legacy round icon: same, clipped to a white circle.
        circle = Image.new("RGBA", (launcher_px, launcher_px), (0, 0, 0, 0))
        mask = Image.new("L", (launcher_px, launcher_px), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, launcher_px, launcher_px), fill=255)
        circle.paste(square, (0, 0), mask)
        circle.save(out_dir / "ic_launcher_round.png")

        print(f"{density}: foreground {fg_px}px, launcher {launcher_px}px")


if __name__ == "__main__":
    main()
