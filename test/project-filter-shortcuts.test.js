import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

// Exercise the actual document key handler with a small DOM adapter; browser
// checks cover layout, native focus and rendering with the complete app.
const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const start = source.indexOf('// Search shortcuts leave editing');
assert.notEqual(start, -1);
const handlerSource = source.slice(start, source.indexOf('\napplySidebarState();', start));
function setup({ sidebar = true, narrow = false, collapsed = false, dialog = false, mobile = false } = {}) {
  const document = { activeElement: null, addEventListener(_type, callback) { this.handler = callback; }, querySelector(selector) { if (selector === ".sidebar") return sidebarEl; return selector === "dialog[open]" ? dialog : content; } };
  class Element {
    constructor(id = "", visible = true) { this.id = id; this.visible = visible; this.value = ""; this.edits = 0; }
    matches() { return this.id === "search" || this.id === "content-search"; }
    closest() { return this.editable; }
    getClientRects() { return this.visible ? [{}] : []; }
    focus() { document.activeElement = this; }
    blur() { document.activeElement = null; }
    dispatchEvent(event) { assert.equal(event.type, "input"); this.edits++; }
  }
  const search = new Element("search", sidebar), content = new Element("content-search", narrow), sidebarEl = new Element("sidebar", !mobile), target = new Element();
  const state = new Set(collapsed ? ["side"] : []);
  runInNewContext(handlerSource, { document, Element, Event, search, collapsed: state, toggleKey() { state.delete("side"); search.visible = true; } });
  const key = (key, options = {}) => {
    const event = { key, target, preventDefault() { this.defaultPrevented = true; }, ...options };
    document.handler(event);
    return event;
  };
  return { document, search, content, target, key, state };
}
test("slash and both find modifiers focus and consume the shortcut", () => {
  for (const [key, options] of [["/", {}], ["f", { ctrlKey: true, code: "KeyF" }], ["f", { metaKey: true, code: "KeyF" }], ["а", { ctrlKey: true, code: "KeyF" }]]) {
    const app = setup();
    assert.equal(app.key(key, options).defaultPrevented, true);
    assert.equal(app.document.activeElement, app.search);
  }
});
test("uses narrow input or expands a collapsed desktop sidebar", () => {
  const narrow = setup({ sidebar: false, narrow: true, collapsed: true });
  narrow.key("/"); assert.equal(narrow.document.activeElement, narrow.content);
  assert.equal(narrow.state.has("side"), true);
  const rail = setup({ sidebar: false, collapsed: true });
  rail.key("/"); assert.equal(rail.document.activeElement, rail.search);
  assert.equal(rail.state.has("side"), false);
  const hidden = setup({ sidebar: false, mobile: true, collapsed: true });
  hidden.key("/"); assert.equal(hidden.document.activeElement, null);
  assert.equal(hidden.state.has("side"), true);
});
test("Escape clears through the input handler, then blurs", () => {
  for (const id of ["search", "content"]) {
    const app = setup(); const target = app[id]; target.value = " alpha "; target.focus();
    app.key("Escape", { target }); assert.equal(target.value, ""); assert.equal(target.edits, 1);
    assert.equal(app.document.activeElement, target);
    app.key("Escape", { target }); assert.equal(app.document.activeElement, null); assert.equal(target.edits, 1);
  }
});
test("editing and open dialogs retain browser shortcuts", () => {
  for (const mode of ["editable", "isContentEditable", "dialog"]) {
    const app = setup({ dialog: mode === "dialog" }); app.target[mode] = true;
    for (const [key, options] of [["/", {}], ["f", { ctrlKey: true, code: "KeyF" }], ["f", { metaKey: true, code: "KeyF" }], ["а", { ctrlKey: true, code: "KeyF" }]]) {
      assert.equal(app.key(key, options).defaultPrevented, undefined);
      assert.equal(app.document.activeElement, null);
    }
  }
});
test("unhandled, modified and composing keys are not consumed", () => {
  const app = setup({ sidebar: false });
  for (const [key, options] of [["/", {}], ["/", { altKey: true }], ["f", { ctrlKey: true, shiftKey: true, code: "KeyF" }], ["/", { isComposing: true }], ["b", { metaKey: true }]]) {
    assert.equal(app.key(key, options).defaultPrevented, undefined);
  }
});
