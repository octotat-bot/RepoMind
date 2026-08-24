/**
 * Sign in, open a repository workspace and capture each view.
 *
 *   node scripts/shoot.mjs <email> <password> [outDir]
 *
 * Falls back to registering + importing when no account is given.
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const APP = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const [, , emailArg, passwordArg, outArg] = process.argv;

const OUT = outArg ?? new URL("./.screenshots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1512, height: 950 } });
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

// Typing before React hydrates sets the DOM value without updating state,
// leaving the submit button disabled. Retry until it enables.
async function fillAndSubmit(fields, buttonName) {
  const submit = page.getByRole("button", { name: buttonName });
  await submit.waitFor({ state: "visible", timeout: 60_000 });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    for (const [selector, value] of Object.entries(fields)) {
      await page.fill(selector, value);
    }
    if (await submit.isEnabled()) break;
    await page.waitForTimeout(750);
  }
  await submit.click();
}

if (emailArg && passwordArg) {
  await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
  await fillAndSubmit({ "#email": emailArg, "#password": passwordArg }, "Sign in");
  await page.waitForURL("**/dashboard", { timeout: 60_000 });
} else {
  const email = `shot-${Date.now()}@repomind.dev`;
  await page.goto(`${APP}/register`, { waitUntil: "networkidle" });
  await fillAndSubmit(
    { "#name": "Ada Lovelace", "#email": email, "#password": "verify-me-1234" },
    "Create account",
  );
  await page.waitForURL("**/dashboard", { timeout: 60_000 });

  await page.goto(`${APP}/import`, { waitUntil: "networkidle" });
  await page.getByLabel("GitHub repository URL").fill("https://github.com/psf/requests");
  await page.getByRole("button", { name: "Import", exact: true }).first().click();
  await page.getByRole("button", { name: /Open workspace/i }).waitFor({ timeout: 900_000 });
  console.log(`  account: ${email} / verify-me-1234`);
}

console.log("landing");
await page.goto(APP, { waitUntil: "networkidle" });
await page.waitForTimeout(1800);
await shot("landing");

console.log("dashboard");
await page.goto(`${APP}/dashboard`, { waitUntil: "networkidle" });
await page.waitForTimeout(1800);
await shot("dashboard");

console.log("search");
await page.goto(`${APP}/search`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const box = page.getByLabel("Semantic code search");
await box.fill("how are retries configured");
await box.press("Enter");
await page.waitForSelector("text=/% match/", { timeout: 90_000 });
await page.waitForTimeout(1200);
await shot("search");

console.log("workspace");
await page.goto(`${APP}/dashboard`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /Open workspace/i }).first().click();
await page.waitForSelector('[role="tablist"]', { timeout: 30_000 });
await page.waitForTimeout(2500);

const composer = page.getByLabel("Ask a question about this repository");
await composer.fill("Explain how a Session dispatches a request through adapters.");
await composer.press("Enter");
await page.waitForSelector("text=/CITATIONS|confidence/i", { timeout: 300_000 });
await page.waitForTimeout(1500);
await shot("workspace-chat");

console.log("architecture");
await page.getByRole("tab", { name: "Architecture" }).click();
await page.waitForSelector('svg[aria-label*="dependency graph"]', { timeout: 120_000 });
await page.waitForTimeout(2000);
await shot("architecture");

console.log("dead code");
await page.getByRole("tab", { name: "Dead code" }).click();
await page.waitForTimeout(5000);
await shot("dead-code");

console.log("settings");
await page.goto(`${APP}/settings`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await shot("settings");

await browser.close();
console.log(`\nsaved to ${OUT}`);
