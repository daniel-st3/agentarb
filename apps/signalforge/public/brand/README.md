# Valrun supplied artwork

These PNGs are exact pixel crops of the owner's supplied 1774 × 887 composition.
No recoloring, redrawing, contrast adjustment or geometry changes were applied.

- `valrun-logo.png`: horizontal logo, crop `(120, 336, 952, 204)`.
- `valrun-app-icon.png`: square icon, crop `(1216, 221, 420, 420)`.

Coordinates are left, top, width, height. Transparent padding is retained.
The dark wordmark is displayed on a pale backing, not inverted for dark mode.

Derived assets in `src/app`: `icon.png` (32px), `apple-icon.png` (180px),
`favicon.ico` (16/32/48px PNG frames). `icon.svg` preserves the old URL by
embedding the supplied square PNG; it is not a vector reinterpretation.
`brand-logo-data.json` embeds the exact horizontal PNG for the static social
image without runtime filesystem or network access. Tests check byte parity.

Derived PNGs omit input metadata. No external font or image service is used.
