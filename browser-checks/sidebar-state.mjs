import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { chromium } from "playwright";
import { startAppServer } from "../src/app.js";

let app;
let browser;
let page;
let savedState;

before(async () => {
  app = await startAppServer({
    projects: [],
    probe: async () => ({ state: "supported", lifecycle: true, version: "1.3.145" }),
    dockerCheck: async () => true,
    claudeDesktopApp: () => null,
  });
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  if (app) await new Promise((resolve) => app.server.close(resolve));
});

beforeEach(async () => {
  savedState = { collapsed: [] };
  page = await browser.newPage();
  await page.route("**/api/state", async (route) => {
    if (route.request().method() === "PUT") savedState = route.request().postDataJSON();
    await route.fulfill({ json: savedState });
  });
});

afterEach(async () => {
  await page?.close();
});

async function loadApp() {
  await page.goto(app.url);
  await page.waitForFunction(() => stateLoaded);
}

async function checkSidebar(expanded) {
  assert.equal(await page.getByRole("button", { name: "Toggle sidebar (Cmd+B)", exact: true, expanded }).count(), 1);
  assert.equal(await page.locator(".app").evaluate((element) => element.classList.contains("rail")), !expanded);
  const controls = await page.locator("#side-toggle").getAttribute("aria-controls");
  assert.ok(controls);
  assert.equal(await page.getByRole("complementary", { name: "Project navigation" }).getAttribute("id"), controls);
}

test("sidebar toggle exposes its expanded state and controlled sidebar on first load", async () => {
  await loadApp();
  await checkSidebar(true);
});

test("sidebar toggle reflects a restored collapsed layout", async () => {
  savedState.collapsed = ["side"];
  await loadApp();
  await checkSidebar(false);
});

test("mouse toggles keep the accessible state in sync with the visible layout", async () => {
  await loadApp();
  await page.locator("#side-toggle").click();
  await checkSidebar(false);
  await page.locator("#side-toggle").click();
  await checkSidebar(true);
});

for (const modifier of ["Control", "Meta"]) {
  test(`${modifier}+B toggles keep the accessible state in sync`, async () => {
    await loadApp();
    await page.keyboard.press(`${modifier}+b`);
    await checkSidebar(false);
    await page.keyboard.press(`${modifier}+b`);
    await checkSidebar(true);
  });
}

test("a saved mouse toggle retains its accessible state after reload", async () => {
  await loadApp();
  const saved = page.waitForResponse((response) => response.url().endsWith("/api/state") && response.request().method() === "PUT");
  await page.locator("#side-toggle").click();
  await saved;
  await loadApp();
  await checkSidebar(false);
});
