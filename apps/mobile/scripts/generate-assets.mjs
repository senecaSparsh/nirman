/**
 * Generates the source images in assets/ that @capacitor/assets consumes:
 *   icon-only.png        1024x1024  — full-bleed icon (dark bg + building)
 *   icon-foreground.png  1024x1024  — building glyph on transparent (Android adaptive)
 *   icon-background.png  1024x1024  — solid brand color (Android adaptive)
 *   splash.png           2732x2732  — centered logo on dark bg
 *   splash-dark.png      2732x2732  — same (dark-only brand)
 *   logo.png             1024x1024  — used by newer asset generator paths
 *
 * Sources from the brand SVG (apps/web/public/icon.svg) so icons stay in
 * sync with the PWA icon. Run: node scripts/generate-assets.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const assetsDir = join(root, "assets");
const svgPath = join(root, "../web/public/icon.svg");

const BRAND_BG = "#1a1a1a";

const svg = await readFile(svgPath, "utf8");
// Foreground variant: drop the solid background <rect> so the glyph sits on
// transparent (Android adaptive icons supply their own background layer).
const foregroundSvg = svg.replace(/<rect width="512" height="512"[^/]*\/>/s, "");

await mkdir(assetsDir, { recursive: true });

const render = (input, size, file) =>
  sharp(Buffer.from(input), { density: 384 })
    .resize(size, size)
    .png()
    .toFile(join(assetsDir, file));

// 1024 icon sources
await render(svg, 1024, "icon-only.png");
await render(svg, 1024, "logo.png");
await render(foregroundSvg, 1024, "icon-foreground.png");
await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: BRAND_BG },
})
  .png()
  .toFile(join(assetsDir, "icon-background.png"));

// 2732 splash screens: brand bg + centered logo (~40% of canvas)
const logo = await sharp(Buffer.from(svg), { density: 384 })
  .resize(680, 680)
  .png()
  .toBuffer();
for (const name of ["splash.png", "splash-dark.png"]) {
  await sharp({
    create: { width: 2732, height: 2732, channels: 4, background: BRAND_BG },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(join(assetsDir, name));
}

console.log("Generated source assets in", assetsDir);
