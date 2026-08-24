/**
 * Exercise the architecture graph's pan/zoom gestures in a real browser.
 *
 *   node scripts/verify-panzoom.mjs
 *
 * Checks the viewBox actually changes, that zoom anchors on the cursor, and
 * that a drag does not get mistaken for a node selection.
 */

import { chromium } from "playwright";

const APP = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.EMAIL ?? "demo@repomind.dev";
const PASSWORD = process.env.PASSWORD ?? "demo12345";

const failures = [];
let checks = 0;

function check(condition, label) {
  checks += 1;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) failures.push(label);
}

const GRAPH = 'svg[aria-label*="dependency graph"]';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1512, height: 950 } });
page.setDefaultTimeout(60_000);

const viewBox = () =>
  page.$eval(GRAPH, (svg) => svg.getAttribute("viewBox").split(" ").map(Number));

const box = () => page.$eval(GRAPH, (svg) => {
  const rect = svg.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
});

// The reset button is deliberately disabled when the view is already at its
// default, so clicking it unconditionally would hang.
async function resetView() {
  const button = page.locator('button[aria-label="Reset view"]');
  if (await button.isEnabled()) await button.click();
  await page.waitForTimeout(350);
}

console.log("\nsigning in");
// `next dev` compiles a route on first request; warm it so the fill below is
// not racing the bundler.
await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" }).catch(() => {});
await page.goto(`${APP}/login`, { waitUntil: "networkidle" });

const submit = page.getByRole("button", { name: "Sign in" });
await submit.waitFor({ state: "visible" });
for (let attempt = 0; attempt < 4; attempt += 1) {
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  if (await submit.isEnabled()) break;
  await page.waitForTimeout(600);
}
await submit.click();
await page.waitForURL("**/dashboard");
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /Open workspace/i }).first().click();
await page.waitForSelector('[role="tablist"]');
await page.getByRole("tab", { name: "Architecture" }).click();
await page.waitForSelector(GRAPH, { timeout: 120_000 });
await page.waitForTimeout(2000);

const initial = await viewBox();
const rect = await box();
const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };

console.log("\n[1] trackpad pinch (ctrl + wheel) zooms in");
await page.mouse.move(centre.x, centre.y);
await page.keyboard.down("Control");
await page.mouse.wheel(0, -240);
await page.keyboard.up("Control");
await page.waitForTimeout(400);

const afterPinch = await viewBox();
check(afterPinch[2] < initial[2], `viewBox narrowed ${initial[2].toFixed(0)} → ${afterPinch[2].toFixed(0)}`);

console.log("\n[2] zoom anchors on the cursor, not the centre");
await resetView();

// Zoom at the top-left corner; the visible region must move toward it.
const corner = { x: rect.x + rect.width * 0.2, y: rect.y + rect.height * 0.2 };
await page.mouse.move(corner.x, corner.y);
await page.keyboard.down("Control");
await page.mouse.wheel(0, -240);
await page.keyboard.up("Control");
await page.waitForTimeout(400);

const anchored = await viewBox();
const reset = await (async () => initial)();
const anchoredCentreX = anchored[0] + anchored[2] / 2;
const baseCentreX = reset[0] + reset[2] / 2;
check(anchoredCentreX < baseCentreX, "view moved toward the cursor, not the centre");

console.log("\n[3] plain scroll does NOT zoom (the panel must still scroll)");
await resetView();
const beforeScroll = await viewBox();
await page.mouse.move(centre.x, centre.y);
await page.mouse.wheel(0, 200);
await page.waitForTimeout(400);
const afterScroll = await viewBox();
check(
  Math.abs(afterScroll[2] - beforeScroll[2]) < 0.01,
  "plain wheel left the zoom untouched",
);

console.log("\n[4] drag pans the view");
await resetView();
const beforeDrag = await viewBox();

await page.mouse.move(centre.x, centre.y);
await page.mouse.down();
await page.mouse.move(centre.x - 120, centre.y - 60, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(300);

const afterDrag = await viewBox();
check(
  Math.abs(afterDrag[0] - beforeDrag[0]) > 1 || Math.abs(afterDrag[1] - beforeDrag[1]) > 1,
  `view panned by (${(afterDrag[0] - beforeDrag[0]).toFixed(0)}, ${(afterDrag[1] - beforeDrag[1]).toFixed(0)})`,
);

console.log("\n[5] a drag does not select a node");
await resetView();

const nodeCentre = await page.$eval(`${GRAPH} circle`, (circle) => {
  const r = circle.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});

await page.mouse.move(nodeCentre.x, nodeCentre.y);
await page.mouse.down();
await page.mouse.move(nodeCentre.x - 90, nodeCentre.y - 40, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(400);

const pinnedAfterDrag = await page.locator('button[aria-label="Clear selection"]').count();
check(pinnedAfterDrag === 0, "dragging from a node did not pin it");

console.log("\n[6] a click still selects a node");
await resetView();
const clickTarget = await page.$eval(`${GRAPH} circle`, (circle) => {
  const r = circle.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.click(clickTarget.x, clickTarget.y);
await page.waitForTimeout(500);
check(
  (await page.locator('button[aria-label="Clear selection"]').count()) === 1,
  "clicking a node opened the inspector",
);

console.log("\n[7] reset returns to the original view");
await page.click('button[aria-label="Clear selection"]').catch(() => {});
await page.mouse.move(centre.x, centre.y);
await page.keyboard.down("Control");
await page.mouse.wheel(0, -200);
await page.keyboard.up("Control");
await page.waitForTimeout(300);
await resetView();

const afterReset = await viewBox();
check(
  afterReset.every((value, index) => Math.abs(value - initial[index]) < 0.01),
  "reset restored the initial viewBox",
);

await page.screenshot({
  path: new URL("./.screenshots/panzoom.png", import.meta.url).pathname,
});
await browser.close();

console.log(`\n${"─".repeat(56)}`);
if (failures.length) {
  console.log(`${failures.length}/${checks} checks FAILED:`);
  for (const failure of failures) console.log(`  · ${failure}`);
  process.exit(1);
}
console.log(`All ${checks} pan/zoom checks passed.`);
