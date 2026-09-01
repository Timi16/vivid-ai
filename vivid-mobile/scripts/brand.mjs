// Regenerates the brand assets in assets/: splash (the mark beside the
// wordmark), the iOS icon, the Android adaptive icon layers and the favicon.
//
//   pnpm brand
//
// Draws everything as SVG, then rasterises with headless Chrome, the one SVG
// renderer a stock Mac has. Monochrome on purpose: the brand is silver on
// black, no colour.
//
// The glyph is the V, copied from vivid-frontend/app/icon.svg so the launcher
// icon, the web favicon and the editor all carry the same mark. It replaces a
// generic robot that had been standing in here: the robot was nobody's logo,
// and it was what actually showed up on the home screen.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "assets");
const work = join(root, ".expo", "brand");
mkdirSync(work, { recursive: true });

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!existsSync(CHROME)) {
  console.error("Google Chrome is needed to rasterise the SVGs (headless screenshot).");
  process.exit(1);
}

const geist = join(root, "node_modules", "@expo-google-fonts", "geist");
const font = `<style>
  @font-face { font-family: "GeistBrand"; font-weight: 700; src: url("file://${geist}/700Bold/Geist_700Bold.ttf"); }
  @font-face { font-family: "GeistBrand"; font-weight: 500; src: url("file://${geist}/500Medium/Geist_500Medium.ttf"); }
</style>`;
const FONT = `GeistBrand, -apple-system, "Helvetica Neue", Arial, sans-serif`;

// The V, on the 32-unit grid it is authored on in vivid-frontend/app/icon.svg.
// `width` is the width of the glyph itself rather than of its box: the path
// spans 15 of those 32 units, and sizing by the ink is what makes the mark
// look the same weight across canvases. It is symmetric about the centre of
// the box in both axes, so centring the box centres the glyph.
const GLYPH_SPAN = 15 / 32;

function mark({ cx, cy, width, color = "#e8e8ea" }) {
  const box = width / GLYPH_SPAN;
  const s = box / 32;
  return `
  <g transform="translate(${cx - box / 2} ${cy - box / 2}) scale(${s})">
    <path d="M8.5 9.5 16 22.5 23.5 9.5" fill="none" stroke="${color}"
      stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

// The light behind the glass, like vd-ambient on the web.
const ambient = (w, h) => `
  <defs>
    <radialGradient id="glow" cx="50%" cy="18%" r="70%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="45%" stop-color="#ffffff" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="#000000"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>`;

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${font}${body}</svg>`;

const files = {
  // Transparent: the splash screen paints the black itself, so the image can
  // scale with the device (imageWidth in app.json).
  "splash-icon.png": [
    1600,
    600,
    svg(
      1600,
      600,
      `
    ${mark({ cx: 360, cy: 300, width: 300 })}
    <text x="640" y="392" font-family='${FONT}' font-weight="700" font-size="300" letter-spacing="-8" fill="#ffffff">Vivid</text>
    <text x="1355" y="392" font-family='${FONT}' font-weight="500" font-size="150" letter-spacing="-2" fill="#ffffff" fill-opacity="0.45">AI</text>`
    ),
  ],
  "icon.png": [
    1024,
    1024,
    svg(1024, 1024, `${ambient(1024, 1024)}${mark({ cx: 512, cy: 512, width: 540 })}`),
  ],
  // Android adaptive layers. The launcher masks these to a shape and can
  // parallax them, so the glyph stays inside the inner 66% safe zone: 540 of
  // 1024 is comfortably within the 676 that always survives the crop.
  "android-icon-foreground.png": [
    1024,
    1024,
    svg(1024, 1024, mark({ cx: 512, cy: 512, width: 460 })),
  ],
  // The monochrome layer is a stencil: themed icons keep only its alpha and
  // repaint it, so it is drawn flat white rather than in the brand silver.
  "android-icon-monochrome.png": [
    1024,
    1024,
    svg(1024, 1024, mark({ cx: 512, cy: 512, width: 460, color: "#ffffff" })),
  ],
  "android-icon-background.png": [1024, 1024, svg(1024, 1024, ambient(1024, 1024))],
  "favicon.png": [
    96,
    96,
    svg(
      96,
      96,
      `<rect width="96" height="96" rx="20" fill="#000000"/>${mark({ cx: 48, cy: 48, width: 48 })}`
    ),
  ],
};

for (const [name, [w, h, markup]] of Object.entries(files)) {
  const source = join(work, name.replace(/\.png$/, ".svg"));
  writeFileSync(source, markup);
  execFileSync(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--allow-file-access-from-files",
      "--default-background-color=00000000",
      `--window-size=${w},${h}`,
      `--screenshot=${join(out, name)}`,
      `file://${source}`,
    ],
    { stdio: "ignore" }
  );
  console.log(`wrote assets/${name}`);
}
