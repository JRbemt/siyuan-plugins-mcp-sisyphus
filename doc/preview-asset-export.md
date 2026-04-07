# Preview Asset Export

- Source SVG: `asset/preview-1024x768.svg`
- Canvas size: `1024x768`
- Recommended PNG output: `asset/preview-1024x768.png`
- Export command:

```bash
rsvg-convert -w 1024 -h 768 asset/preview-1024x768.svg -o asset/preview-1024x768.png
```

- Fallback with Inkscape:

```bash
inkscape asset/preview-1024x768.svg --export-type=png --export-filename=asset/preview-1024x768.png -w 1024 -h 768
```

- Current root `preview.png` remains unchanged. Replace it manually only if you want this new composition to become the marketplace/default preview.
