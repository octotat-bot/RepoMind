/**
 * Drives the real UI through a full journey in a headless browser.
 *
 * Requires the backend on :8000 and `npm run dev` on :3000. Screenshots land in
 * scripts/.screenshots so the result can be inspected by eye.
 *
 *   node scripts/verify-ui.mjs
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

// Point at a deployed instance with APP_URL=https://your-app.vercel.app
const APP = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SHOTS = new URL("./.screenshots/", import.meta.url).pathname;
const REPO_URL = process.env.REPO_URL ?? "https://github.com/psf/requests";

mkdirSync(SHOTS, { recursive: true });

const failures = [];
let checks = 0;
const consoleErrors = [];
// Some steps navigate somewhere that is *meant* to fail; their noise must not
// hide a genuine error from another page.
let expectFailures = false;

function check(condition, label) {
  checks += 1;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) failures.push(label);
}

const shot = (page, name) => page.screenshot({ path: `${SHOTS}${name}.png`, fullPage: false });

/**
 * Fill a form and submit it, tolerating React not having hydrated yet.
 *
 * Typing into an input before hydration sets the DOM value but never reaches
 * React state, so the submit button stays disabled. Retrying the fill is the
 * reliable fix; waiting a fixed delay is not.
 */
async function fillAndSubmit(page, fields, buttonName) {
  const submit = page.getByRole("button", { name: buttonName });
  await submit.waitFor({ state: "visible" });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    for (const [selector, value] of Object.entries(fields)) {
      await page.fill(selector, value);
    }

    if (!(await submit.isEnabled())) {
      await page.waitForTimeout(600);
      continue;
    }

    try {
      await submit.click({ timeout: 5000 });
      return;
    } catch {
      // A dev-server hot reload can remount the form between the check and the
      // click, clearing what was just typed. Fill it again and retry.
    }
  }

  throw new Error(`Could not submit "${buttonName}": the form kept resetting.`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1512, height: 950 } });

  // `next dev` compiles each route the first time it is requested, which can
  // take longer than a default timeout on a cold cache. Warm the public routes
  // here; the protected ones cannot be reached until after sign-in, because an
  // anonymous visit is redirected before their components ever compile.
  page.setDefaultTimeout(60_000);
  for (const route of ["/", "/login", "/register"]) {
    await page.goto(`${APP}${route}`, { waitUntil: "domcontentloaded" }).catch(() => {});
  }

  page.on("console", (message) => {
    if (message.type() === "error" && !expectFailures) consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    if (!expectFailures) consoleErrors.push(`pageerror: ${error.message}`);
  });

  const email = `ui-${Date.now()}@repomind.dev`;

  console.log("\n[1] landing");
  await page.goto(APP, { waitUntil: "networkidle" });
  check(await page.getByRole("heading", { level: 1 }).first().isVisible(), "hero renders");
  await shot(page, "01-landing");

  console.log("\n[2] register");
  await page.goto(`${APP}/register`, { waitUntil: "networkidle" });
  await shot(page, "02-register");
  await fillAndSubmit(
    page,
    {
      "#name": "UI Bot",
      "#email": email,
      "#password": "verify-me-1234",
      "#confirm-password": "verify-me-1234",
    },
    "Create account",
  );
  await page.waitForURL("**/dashboard", { timeout: 60_000 });
  check(page.url().includes("/dashboard"), "register redirects to the dashboard");

  // Now that there is a session, compile the protected routes.
  for (const route of ["/import", "/search", "/settings", "/dashboard"]) {
    await page.goto(`${APP}${route}`, { waitUntil: "domcontentloaded" }).catch(() => {});
  }

  console.log("\n[3] empty dashboard");
  await page.waitForSelector("text=Repositories", { timeout: 15_000 });
  await shot(page, "03-dashboard-empty");
  check(await page.getByText(/Import a repository/i).first().isVisible(), "empty state invites an import");

  console.log("\n[4] import");
  await page.goto(`${APP}/import`, { waitUntil: "networkidle" });
  const urlInput = page.getByLabel("GitHub repository URL");
  await urlInput.fill(REPO_URL);
  await shot(page, "04-import");
  await page.getByRole("button", { name: "Import", exact: true }).first().click();

  console.log("      indexing (live progress)…");
  // The import page shows a live pipeline; wait for its terminal state.
  await page.waitForSelector("text=/Open workspace|Indexing complete|Ready to query/i", {
    timeout: 900_000,
  });
  await shot(page, "05-indexing-done");
  check(true, "indexing reached a ready state in the UI");

  console.log("\n[5] dashboard with a repository");
  await page.goto(`${APP}/dashboard`, { waitUntil: "networkidle" });
  // Waiting on the action rather than the name: it proves the card rendered
  // *and* that the repository is queryable, which is what the next steps need.
  const openWorkspace = page.getByRole("button", { name: /Open workspace/i }).first();
  await openWorkspace.waitFor();
  await page.waitForTimeout(800);
  await shot(page, "06-dashboard");
  check(await openWorkspace.isEnabled(), "repository card renders and is ready to open");

  console.log("\n[6] semantic search");
  await page.goto(`${APP}/search`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const searchBox = page.getByLabel("Semantic code search");
  await searchBox.fill("how are http sessions handled");
  await searchBox.press("Enter");
  await page.waitForSelector("text=/% match/", { timeout: 60_000 });
  await shot(page, "07-search");
  const matchCount = await page.locator("text=/% match/").count();
  check(matchCount > 0, `search rendered ${matchCount} ranked results`);

  console.log("\n[7] workspace: open");
  await page.goto(`${APP}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /Open workspace/i }).first().click();
  await page.waitForURL("**/workspace/**", { timeout: 30_000 });
  await page.waitForSelector('[role="tablist"]', { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await shot(page, "08-workspace");
  check(page.url().includes("/workspace/"), "workspace route opened");
  check(await page.getByText("EXPLORER").isVisible(), "file explorer panel renders");

  console.log("\n[8] workspace: file explorer");
  const firstFolder = page.locator('button[aria-expanded]').first();
  await firstFolder.click();
  await page.waitForTimeout(600);
  const fileButton = page.locator('button[title$=".py"]').first();
  if (await fileButton.count()) {
    await fileButton.click();
    await page.waitForTimeout(2500);
    await shot(page, "09-file-viewer");
    check(await page.locator('[data-line="1"]').first().isVisible(), "file viewer shows numbered source");
  } else {
    check(false, "found a .py file in the explorer");
  }

  console.log("\n[9] workspace: chat with streaming + citations");
  await page.getByRole("tab", { name: "Chat" }).click();
  await page.waitForTimeout(500);
  const composer = page.getByLabel("Ask a question about this repository");
  await composer.fill("How does this library send an HTTP GET request?");
  await composer.press("Enter");

  await page.waitForSelector("text=/Searching the index/", { timeout: 20_000 }).catch(() => {});
  await page.waitForSelector("text=/CITATIONS|confidence/i", { timeout: 300_000 });
  await page.waitForTimeout(1200);
  await shot(page, "10-chat-answer");
  check(await page.getByText(/CITATIONS/).isVisible(), "answer rendered citations");
  check(
    await page.getByText(/High confidence|Moderate confidence|Low confidence/).isVisible(),
    "answer rendered a confidence meter",
  );

  console.log("\n[10] workspace: retrieved context panel");
  check(await page.getByRole("tab", { name: /Context/ }).isVisible(), "context tab present");
  await shot(page, "11-context");

  console.log("\n[11] workspace: citation opens the cited file");
  const citation = page.locator('button[title^="Open "]').first();
  if (await citation.count()) {
    await citation.click();
    await page.waitForTimeout(2500);
    await shot(page, "12-citation-jump");
    check(await page.getByText(/Showing cited lines/).isVisible(), "citation opened the file at its range");
  } else {
    check(false, "a citation chip was clickable");
  }

  console.log("\n[12] workspace: architecture graph");
  await page.getByRole("tab", { name: "Architecture" }).click();
  await page.waitForSelector('svg[aria-label*="dependency graph"]', { timeout: 120_000 });
  await page.waitForTimeout(1500);
  await shot(page, "13-architecture");
  const nodeCount = await page.locator('svg[aria-label*="dependency graph"] circle').count();
  check(nodeCount > 0, `dependency graph rendered ${nodeCount} nodes`);

  console.log("\n[13] workspace: dead code");
  await page.getByRole("tab", { name: "Dead code" }).click();
  await page.waitForTimeout(4000);
  await shot(page, "14-dead-code");
  check(
    (await page.getByText(/Unused export|Unreferenced file|Nothing obviously dead/).count()) > 0,
    "dead-code analysis rendered",
  );

  console.log("\n[14] settings");
  await page.goto(`${APP}/settings`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=System", { timeout: 20_000 });
  await page.waitForTimeout(2000);
  await shot(page, "15-settings");
  check(await page.getByText(/Healthy|Degraded/).isVisible(), "system health rendered");

  console.log("\n[15] 404");
  expectFailures = true; // the navigation below is supposed to 404
  await page.goto(`${APP}/does-not-exist`, { waitUntil: "networkidle" });
  await shot(page, "16-404");
  check((await page.getByText(/404|not found/i).count()) > 0, "404 page renders");
  expectFailures = false;

  console.log("\n[16] sign out");
  await page.goto(`${APP}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /UI Bot/ }).first().click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL("**/login", { timeout: 15_000 });
  check(page.url().includes("/login"), "sign out returns to login");

  console.log("\n[17] protected route redirects when signed out");
  await page.goto(`${APP}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  check(page.url().includes("/login"), "dashboard bounces anonymous users to login");

  await browser.close();

  const realErrors = consoleErrors.filter(
    (text) => !/favicon|Download the React DevTools|hydrat/i.test(text),
  );
  console.log(`\n${"─".repeat(60)}`);
  if (realErrors.length) {
    console.log(`Console errors (${realErrors.length}):`);
    for (const error of new Set(realErrors)) console.log(`  · ${error.slice(0, 200)}`);
  } else {
    console.log("No console errors.");
  }

  if (failures.length) {
    console.log(`\n${failures.length}/${checks} UI checks FAILED:`);
    for (const failure of failures) console.log(`  · ${failure}`);
    process.exit(1);
  }
  console.log(`\nAll ${checks} UI checks passed. Screenshots in scripts/.screenshots/`);
}

main().catch((error) => {
  console.error("\nVerification crashed:", error.message);
  process.exit(1);
});
