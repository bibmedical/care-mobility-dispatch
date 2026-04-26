GPS CARS SVG FOLDER

This folder supports 2 ways to select icons on the map:

1) Automatic per-driver variant (default)
- Files used: /assets/gpscars/car-01.svg ... /assets/gpscars/car-20.svg
- Driver gets one variant based on driver id/name hash.

2) Per-driver custom SVG override
- In Settings > GPS Settings, use field: Vehicle SVG Path (optional)
- Example values:
  /assets/gpscars/car-07.svg
  /assets/gpscars/custom-balbino.svg

Recommended SVG format:
- Transparent background
- Tight viewBox/canvas around the car (avoid large empty margins)
- Keep same orientation as current car icons

How to replace icons quickly:
- Replace any existing car-XX.svg file with your own SVG using same filename.
- Or add new SVG files and point each driver to that path in GPS Settings.
