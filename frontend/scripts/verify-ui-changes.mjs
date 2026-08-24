/** Check the floating nav, the confirm-password field, and the user menu. */

import { chromium } from "playwright";

const APP = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SHOTS = new URL("./.screenshots/", import.meta.url).pathname;

const failures = [];
let checks = 0;
const check = (condition, label) => {
  checks += 1;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) failures.push(label);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1512, height: 950 } });
page.setDefaultTimeout(60_000);

console.log("\n[1] landing nav floats and is transparent over the hero");
await page.goto(APP, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

/** Alpha of a computed colour, however the browser chose to serialise it. */
const alphaOf = (colour) => {
  const match = colour.match(/[\d.]+\s*\)$/);
  if (colour.includes("/")) return parseFloat(colour.split("/").pop());
  if (colour.startsWith("rgba")) return parseFloat(match?.[0] ?? "1");
  return colour === "rgba(0, 0, 0, 0)" ? 0 : 1;
};

const navBar = page.locator("header > div").first();
const viewport = page.viewportSize();
const atTop = await navBar.evaluate((el) => {
  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return {
    background: style.backgroundColor,
    backdrop: style.backdropFilter,
    radius: style.borderRadius,
    left: Math.round(rect.left),
    right: Math.round(rect.right),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
});

const topAlpha = alphaOf(atTop.background);
check(topAlpha < 0.1, `barely tinted over the hero (alpha ${topAlpha})`);
// rounded-full serialises as an enormous pixel value, so compare to the height.
check(
  parseFloat(atTop.radius) >= atTop.height / 2,
  `fully rounded pill (radius ${parseFloat(atTop.radius).toFixed(0)}px vs height ${atTop.height}px)`,
);
check(
  atTop.width < viewport.width * 0.7,
  `hugs its content rather than spanning the page (${atTop.width} of ${viewport.width}px)`,
);
check(
  Math.abs(atTop.left - (viewport.width - atTop.right)) <= 2,
  "centred horizontally",
);
check(atTop.backdrop.includes("blur"), `blurs what is behind it (${atTop.backdrop})`);
await page.screenshot({ path: `${SHOTS}nav-top.png`, clip: { x: 0, y: 0, width: 1512, height: 200 } });

console.log("\n[2] nav becomes glass once scrolled");
await page.mouse.wheel(0, 600);
await page.waitForTimeout(700);
const scrolled = await navBar.evaluate((el) => {
  const style = getComputedStyle(el);
  return { background: style.backgroundColor, backdrop: style.backdropFilter };
});
const scrolledAlpha = alphaOf(scrolled.background);
check(scrolledAlpha > topAlpha, `gains presence once scrolled (${topAlpha} → ${scrolledAlpha})`);
check(scrolledAlpha < 0.2, `still reads as glass, not a solid bar (alpha ${scrolledAlpha})`);
check(scrolled.backdrop.includes("blur"), `blurs content behind (${scrolled.backdrop})`);
const stillVisible = await navBar.evaluate((el) => el.getBoundingClientRect().top);
check(stillVisible >= 0 && stillVisible < 60, `stays pinned near the top (${stillVisible}px)`);
await page.screenshot({ path: `${SHOTS}nav-scrolled.png`, clip: { x: 0, y: 0, width: 1512, height: 200 } });

console.log("\n[3] sign-up has a confirm-password field that is enforced");
await page.goto(`${APP}/register`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

check((await page.locator("#confirm-password").count()) === 1, "confirm password field exists");

const submit = page.getByRole("button", { name: "Create account" });
const email = `confirm-${Date.now()}@repomind.dev`;
for (let attempt = 0; attempt < 4; attempt += 1) {
  await page.fill("#name", "Confirm Test");
  await page.fill("#email", email);
  await page.fill("#password", "verify-me-1234");
  await page.fill("#confirm-password", "something-else");
  if ((await page.locator("#name").inputValue()) === "Confirm Test") break;
  await page.waitForTimeout(500);
}
await page.waitForTimeout(400);
check(!(await submit.isEnabled()), "submit stays disabled while the two differ");
check(
  (await page.getByText("Passwords do not match.").count()) === 1,
  "mismatch is explained, not just blocked",
);
await page.screenshot({ path: `${SHOTS}register-mismatch.png` });

await page.fill("#confirm-password", "verify-me-1234");
await page.waitForTimeout(400);
check(await submit.isEnabled(), "submit enables once they match");

console.log("\n[4] signing up still works end to end");
await submit.click();
await page.waitForURL("**/dashboard", { timeout: 60_000 });
check(page.url().includes("/dashboard"), "registration completed");

console.log("\n[5] Profile and Settings are different pages");
// Warm both routes so the checks are not racing dev-mode compilation.
for (const route of ["/profile", "/settings"]) {
  await page.goto(`${APP}${route}`, { waitUntil: "domcontentloaded" }).catch(() => {});
}

const openMenuItem = async (label) => {
  await page.goto(`${APP}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: /Confirm Test/ }).first().click();
  await page.waitForTimeout(350);
  await page.getByRole("menuitem", { name: label }).click();
  await page.waitForTimeout(1500);
  return page.url();
};

const profileUrl = await openMenuItem("Profile");
check(profileUrl.endsWith("/profile"), `Profile opens its own page (${profileUrl})`);
check(
  (await page.getByRole("heading", { name: "Profile", level: 1 }).count()) === 1,
  "the profile page renders its own heading",
);
check(
  (await page.getByText("Member since").count()) === 1,
  "it shows account details Settings does not",
);
check(
  (await page.getByText(/Repositories|Files indexed/).count()) > 0,
  "it shows indexing activity",
);
await page.screenshot({ path: `${SHOTS}profile.png` });

const settingsUrl = await openMenuItem("Settings");
check(settingsUrl.endsWith("/settings"), `Settings opens the settings page (${settingsUrl})`);
check(profileUrl !== settingsUrl, "the two menu items lead to different pages");
check(
  (await page.getByText("Existing sessions stay signed in").count()) === 1,
  "settings shows the password form, which profile does not",
);
await page.screenshot({ path: `${SHOTS}settings.png` });

await browser.close();

console.log(`\n${"─".repeat(56)}`);
if (failures.length) {
  console.log(`${failures.length}/${checks} checks FAILED:`);
  for (const failure of failures) console.log(`  · ${failure}`);
  process.exit(1);
}
console.log(`All ${checks} checks passed.`);
