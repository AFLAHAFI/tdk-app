import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { chromium } from "playwright";
import { startAppServer } from "../src/app.js";

let app;
let browser;
let page;

before(async () => {
  app = await startAppServer({
    projects: [],
    probe: async () => ({ state: "supported", lifecycle: true, version: "1.3.145" }),
    dockerCheck: async () => true,
    claudeDesktopApp: () => null,
  });
  browser = await chromium.launch();
  page = await browser.newPage();
});

after(async () => {
  await browser?.close();
  if (app) await new Promise((resolve) => app.server.close(resolve));
});

beforeEach(async () => {
  await page.goto(app.url);
  await page.waitForFunction(() => typeof openForm === "function");
});

test("logs dialog uses its current visible title as its accessible name", async () => {
  // Open through the app's own logs action so the title is set by the real code path.
  for (const name of ["api", "worker"]) {
    await page.evaluate((name) => {
      document.querySelector("#logs").close();
      handleAction({ dataset: { action: "logs", project: "shop", name } });
    }, name);
    await page.locator("#logs[open]").waitFor();
    assert.equal(await page.getByRole("dialog", { name: `Recent logs · ${name}`, exact: true }).count(), 1);
  }
});

test("new-project form is named by its heading", async () => {
  await page.locator("#new-project-nav").click();
  await page.locator("#form-dialog[open]").waitFor();
  assert.equal(await page.getByRole("dialog", { name: "New project", exact: true }).count(), 1);
});

test("replacing a form updates the name, including escaped text", async () => {
  for (const title of ["New stack", "Move <api> & worker"]) {
    await page.evaluate((title) => {
      if (formDialog.open) formDialog.close();
      openForm({ title, fields: [], submit: "Save", run: async () => ({ ok: true }) });
    }, title);
    assert.equal(await page.getByRole("dialog", { name: title, exact: true }).count(), 1);
  }
});

test("the alternate form dialog has its own current heading as its name", async () => {
  await page.evaluate(() => openBuildWithAi());
  assert.equal(await page.getByRole("dialog", { name: "Build with AI", exact: true }).count(), 1);
});
