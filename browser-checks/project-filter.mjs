import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { chromium } from "playwright";
import { startAppServer } from "../src/app.js";

let app, browser, page;
before(async () => {
  app = await startAppServer({ projects: [], probe: async () => ({ state: "supported", lifecycle: true }), dockerCheck: async () => true, claudeDesktopApp: () => null });
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  if (app) await new Promise((resolve) => app.server.close(resolve));
});
beforeEach(async () => {
  page = await browser.newPage();
  await page.route("**/api/state", (route) => route.fulfill({ json: { collapsed: [] } }));
  await page.route("**/api/projects?*", (route) => route.fulfill({ json: { projects: [
    { id: "a", name: "Alpha", path: "/fixtures/alpha", resources: [], stacks: [] },
    { id: "b", name: "Beta", path: "/fixtures/beta", resources: [], stacks: [] },
  ] } }));
  await page.goto(app.url);
  await page.locator(".project-row").first().waitFor();
});
afterEach(async () => page?.close());
const focused = async (id) => assert.equal(await page.evaluate(() => document.activeElement.id), id);

for (const key of ["/", "Control+f", "Meta+f"]) {
  test(`${key} focuses the visible sidebar filter`, async () => {
    await page.keyboard.press(key);
    await focused("search");
    assert.equal(await page.getByRole("searchbox", { name: "Filter projects", exact: true }).count(), 1);
    assert.equal(await page.locator("#search").getAttribute("title"), "Filter projects (/ or Ctrl/Cmd+F)");
  });
}
test("collapsed desktop sidebar expands before focusing", async () => {
  await page.locator("#side-toggle").click();
  await page.keyboard.press("/");
  await focused("search");
  assert.equal(await page.locator("#side-toggle").getAttribute("aria-expanded"), "true");
});
for (const width of [1280, 500]) {
  test(`filter clear/blur and filtering at width ${width}`, async () => {
    await page.setViewportSize({ width, height: 800 });
    await page.keyboard.press("/");
    const id = width === 500 ? "content-search" : "search";
    await focused(id);
    const filter = page.locator(`#${id}`);
    await filter.fill(" ALPHA ");
    assert.deepEqual(await page.locator(".project-row .row-title strong").allTextContents(), ["Alpha"]);
    await filter.press("Escape");
    await focused(id);
    assert.equal(await page.locator(".project-row").count(), 2);
    assert.equal(await page.locator("#search").inputValue(), "");
    assert.equal(await page.locator("#content-search").inputValue(), "");
    await page.keyboard.press("Escape");
    assert.notEqual(await page.evaluate(() => document.activeElement.id), id);
    await filter.fill("/fixtures/beta");
    assert.deepEqual(await page.locator(".project-row .row-title strong").allTextContents(), ["Beta"]);
    await filter.fill("missing");
    assert.equal(await page.locator(".project-row").count(), 0);
    await filter.press("Escape");
    assert.equal(await page.locator(".project-row").count(), 2);
  });
}
test("editable controls retain their shortcuts and focus", async () => {
  for (const markup of ['<input>', '<textarea></textarea>', '<select><option>One</option></select>', '<div contenteditable="true"><span tabindex="0">Edit</span></div>', '<div role="textbox" tabindex="0"></div>']) {
    await page.evaluate((markup) => {
      document.querySelector("#test-editable")?.remove();
      const host = document.createElement("div"); host.id = "test-editable"; host.innerHTML = markup; document.body.append(host);
      (host.querySelector("span") || host.firstElementChild).focus();
    }, markup);
    for (const key of ["/", "f"]) {
      const result = await page.evaluate((key) => {
        const target = document.activeElement;
        const event = new KeyboardEvent("keydown", { key, code: key === "f" ? "KeyF" : "Slash", ctrlKey: key === "f", bubbles: true, cancelable: true });
        target.dispatchEvent(event);
        return { prevented: event.defaultPrevented, retained: document.activeElement === target };
      }, key);
      assert.deepEqual(result, { prevented: false, retained: true });
    }
  }
});
test("open dialogs do not intercept find or slash", async () => {
  await page.locator("#new-project-nav").click();
  await page.locator("#form-dialog[open]").waitFor();
  for (const modifiers of [{ key: "/", code: "Slash" }, { key: "f", code: "KeyF", ctrlKey: true }, { key: "f", code: "KeyF", metaKey: true }]) {
    assert.equal(await page.evaluate((modifiers) => {
      const event = new KeyboardEvent("keydown", { ...modifiers, bubbles: true, cancelable: true });
      document.querySelector("#form-dialog").dispatchEvent(event);
      return event.defaultPrevented;
    }, modifiers), false);
  }
});
test("Control+B and Meta+B still toggle the sidebar", async () => {
  for (const modifier of ["Control", "Meta"]) {
    await page.keyboard.press(`${modifier}+b`);
    assert.equal(await page.locator("#side-toggle").getAttribute("aria-expanded"), "false");
    await page.keyboard.press(`${modifier}+b`);
    assert.equal(await page.locator("#side-toggle").getAttribute("aria-expanded"), "true");
  }
});
