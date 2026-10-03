# Landing page

Static site for https://lefyd24.github.io/PersonalFinance/ (plain HTML, CSS and JS, no build step).

- `index.html`: all markup and English copy. `assets/app.js` holds the Greek translations (`EL`), the theme and language toggles, the live dashboard preview in the hero, the scroll-driven reel and the privacy monitor. No libraries.
- `assets/img/*.webp`: screenshots cropped from `docs/assets/screenshots/` (caption bar removed). Re-crop with `magick <shot>.jpg -crop 1760x880+80+122 +repage -resize 1600x -quality 84 <name>.webp`.
- `assets/video/demo.mp4`: 720p re-encode of `promo/hf_marketing.mp4`, loaded only when the demo dialog opens.
- Fonts are self-hosted from `@fontsource-variable`, so the page makes no third-party requests.
- Deployed by `.github/workflows/pages.yml` on pushes to `main` that touch `landing_page/`. In the repo settings, set Pages → Source to **GitHub Actions**.

Preview locally: `python3 -m http.server -d landing_page 8000`. Add `?lang=el` or `?theme=dark` to force a language or theme.
