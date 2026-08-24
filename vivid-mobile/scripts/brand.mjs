// Regenerates the brand assets in assets/: splash (bot beside the wordmark),
// the iOS icon, the Android adaptive icon layers and the favicon.
//
//   pnpm brand
//
// Draws everything as SVG, then rasterises with headless Chrome, the one SVG
// renderer a stock Mac has. The bot is drawn on the same 24-unit grid and
// 1.7 stroke as components/ui/icons.tsx so it reads as part of the icon set.
// Monochrome on purpose: the brand is silver on black, no colour.

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

function bot({ x, y, size, mono = false }) {
  const s = size / 24;
  const line = "#ffffff";
  const head = mono ? line : "rgba(255,255,255,0.08)";
  const face = mono ? "#000000" : line;
  return `
  <g transform="translate(${x} ${y}) scale(${s})" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="7" width="16" height="13" rx="4.2" fill="${head}" stroke="${line}" stroke-width="1.7"/>
    <path d="M12 7V4.4" stroke="${line}" stroke-width="1.7"/>
    <circle cx="12" cy="3.2" r="1.25" fill="${line}"/>
    <rect x="1.6" y="11" width="1.7" height="4.4" rx="0.85" fill="${line}"/>
    <rect x="20.7" y="11" width="1.7" height="4.4" rx="0.85" fill="${line}"/>
    <rect x="8" y="11.2" width="2.5" height="3.4" rx="1.25" fill="${face}"/>
    <rect x="13.5" y="11.2" width="2.5" height="3.4" rx="1.25" fill="${face}"/>
    <path d="M9.6 17.1h4.8" stroke="${face}" stroke-opacity="${mono ? 1 : 0.45}" stroke-width="1.5"/>
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
    ${bot({ x: 150, y: 90, size: 420 })}
    <text x="640" y="392" font-family='${FONT}' font-weight="700" font-size="300" letter-spacing="-8" fill="#ffffff">Vivid</text>
    <text x="1355" y="392" font-family='${FONT}' font-weight="500" font-size="150" letter-spacing="-2" fill="#ffffff" fill-opacity="0.45">AI</text>`
    ),
  ],
  "icon.png": [
    1024,
    1024,
    svg(1024, 1024, `${ambient(1024, 1024)}${bot({ x: 172, y: 172, size: 680 })}`),
  ],
  // Android adaptive layers: the bot inside the 66% safe zone.
  "android-icon-foreground.png": [1024, 1024, svg(1024, 1024, bot({ x: 272, y: 272, size: 480 }))],
  "android-icon-monochrome.png": [
    1024,
    1024,
    svg(1024, 1024, bot({ x: 272, y: 272, size: 480, mono: true })),
  ],
  "android-icon-background.png": [1024, 1024, svg(1024, 1024, ambient(1024, 1024))],
  "favicon.png": [
    96,
    96,
    svg(
      96,
      96,
      `<rect width="96" height="96" rx="20" fill="#000000"/>${bot({ x: 12, y: 12, size: 72 })}`
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
