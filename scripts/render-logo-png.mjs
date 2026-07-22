import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playwrightEntry = path.join(root, "..", "onipin", "node_modules", "playwright", "index.js");
const pw = (await import(pathToFileURL(playwrightEntry).href)).default;
const { chromium } = pw;
const svgPath = path.join(root, "icon.svg");
const outDir = path.join(root, "assets");
const out = path.join(outDir, "logo.png");
fs.mkdirSync(outDir, { recursive: true });

const svg = fs.readFileSync(svgPath, "utf8");
const html = `<!doctype html><html><body style="margin:0;background:#000">
<div id="c" style="width:512px;height:512px">${svg}</div>
</body></html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
await page.setContent(html, { waitUntil: "load" });
await page.locator("#c").screenshot({ path: out, type: "png" });
await browser.close();
console.log("wrote", out, fs.statSync(out).size);
