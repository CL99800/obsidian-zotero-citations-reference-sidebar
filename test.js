"use strict";

const assert = require("node:assert/strict");
const Module = require("node:module");
const originalLoad = Module._load;

class FakePlugin {}
class FakeItemView {}
class FakeSettingTab {}
let requestHandler = async () => { throw new Error("Request handler not configured"); };
Module._load = function patchedLoad(id, parent, isMain) {
  if (id === "obsidian") return {
    Plugin: FakePlugin, ItemView: FakeItemView, PluginSettingTab: FakeSettingTab,
    Setting: class {}, Notice: class {}, requestUrl: (args) => requestHandler(args), setIcon: () => {},
  };
  return originalLoad.call(this, id, parent, isMain);
};
const Plugin = require("./main.js");
Module._load = originalLoad;
const { parseZoteroCitations, maskFencedCode, markdownToPlain, buildZoteroItemUri, ReferenceSidebarView } = Plugin.testUtils;
assert.equal(new ReferenceSidebarView(null, {}).getIcon(), "quote", "sidebar tab should use the quote icon");

const screenshot = "参考图3a ^[<!-- zotero:3FT52DT7: --> Greiner, N. *et al.* Recruitment of upper-limb motoneurons with epidural electrical stimulation of the cervical spinal cord. *Nat Commun* **12**, 435 (2021).<!-- /zotero-citation -->]";
let refs = parseZoteroCitations(screenshot);
assert.equal(refs.length, 1);
assert.equal(refs[0].key, "3FT52DT7");
assert.equal(refs[0].offsets.length, 1);
assert.match(refs[0].fallback, /Recruitment of upper-limb/);

refs = parseZoteroCitations(screenshot + "\n后文再次引用 ^[<!-- zotero:3FT52DT7: --> Greiner, *et al.* <!-- /zotero-citation -->]");
assert.equal(refs.length, 1, "same Zotero key should be deduplicated");
assert.equal(refs[0].offsets.length, 2, "occurrences should remain navigable");

refs = parseZoteroCitations("^[<!-- zotero:ABCD2345:pp. 12-13 --> A <!-- /zotero-citation -->] and ^[<!-- zotero:QWER5678: --> B <!-- /zotero-citation -->]");
assert.deepEqual(refs.map((r) => r.key), ["ABCD2345", "QWER5678"]);

refs = parseZoteroCitations("```markdown\n<!-- zotero:SKIP0001: -->\n```\nreal ^[<!-- zotero:REAL0001: --> Example <!-- /zotero-citation -->]");
assert.deepEqual(refs.map((r) => r.key), ["REAL0001"]);

refs = parseZoteroCitations("Text `<!-- zotero:FAKE0001: -->` and <!-- zotero:REAL0002: --> real <!-- /zotero-citation -->");
assert.deepEqual(refs.map((r) => r.key), ["REAL0002"]);

assert.equal(maskFencedCode("A\n~~~\nX\n~~~\nB").length, "A\n~~~\nX\n~~~\nB".length);
assert.equal(markdownToPlain("*Nat Commun* **12**, 435 (2021)"), "Nat Commun 12, 435 (2021)");
assert.equal(buildZoteroItemUri("3FT52DT7", "users/0"), "zotero://select/library/items/3FT52DT7");
assert.equal(buildZoteroItemUri("QWER5678", "groups/12345"), "zotero://select/groups/12345/items/QWER5678");
assert.equal(buildZoteroItemUri("QWER5678", null), "zotero://select/library/items/QWER5678", "offline items should retain a usable jump link");
assert.equal(buildZoteroItemUri("../wrong", "users/0"), null);

// An offline/cached entry must render only its bibliography text and action
// button, without the extra warning or source line seen in the screenshot.
class FakeNode {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.classList = { add() {} };
  }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  addEventListener() {}
}
const originalDocument = globalThis.document;
globalThis.document = { createElement: (tag) => new FakeNode(tag) };
try {
  const view = new ReferenceSidebarView(null, { jumpToCitation() {}, openZoteroItem() {} });
  view.listEl = new FakeNode("div");
  view.items = [
    { key: "OFFL1234", plain: "Footnote reference (2021).", offsets: [0], source: "footnote", scope: null, html: null },
    { key: "CACH1234", plain: "Cached reference (2020).", offsets: [12], source: "cache", scope: "users/0", html: null },
  ];
  view.renderList();
  assert.equal(view.listEl.children.length, 2);
  for (const row of view.listEl.children) {
    assert.equal(row.children.length, 3, "row should contain only number, bibliography, and arrow");
    assert.equal(row.children[1].children.length, 1, "bibliography should have no source-warning label");
    assert.equal(row.children[2].children.length, 1, "Zotero arrow should remain visible");
    assert.notEqual(row.children[2].children[0].disabled, true, "Zotero arrow should remain clickable");
  }
} finally {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
}

(async () => {
  const plugin = new Plugin();
  plugin.settings = { port: 23119, style: "apa", locale: "en-US", searchGroupLibraries: true };
  plugin.cache = new Map();
  plugin.failedUntil = new Map();
  plugin.groupIds = null;
  plugin.queueCacheSave = () => {};

  let calls = 0;
  requestHandler = async ({ url }) => {
    calls++;
    assert.match(url, /127\.0\.0\.1:23119/);
    return { text: '<div class="csl-entry">Greiner, N. <i>Nature</i> (2021).</div>' };
  };
  const first = await plugin.resolveReference({ key: "3FT52DT7", offsets: [0], fallback: "Greiner note" }, false);
  assert.equal(first.source, "zotero");
  assert.equal(first.scope, "users/0");
  assert.match(first.plain, /Greiner/);
  const again = await plugin.resolveReference({ key: "3FT52DT7", offsets: [0], fallback: "" }, false);
  assert.equal(calls, 1, "recent cached references should not trigger another HTTP call");
  assert.equal(again.source, "zotero");

  plugin.cache.set(plugin.cacheKey("LEGACY01"), { html: "<div>Old cache</div>", at: Date.now() });
  await plugin.resolveReference({ key: "LEGACY01", offsets: [0], fallback: "" }, false);
  assert.equal(calls, 2, "old cache without library scope must be re-resolved");

  requestHandler = async ({ url }) => {
    if (url.includes("users/0/items/")) throw Object.assign(new Error("404"), { status: 404 });
    if (url.endsWith("users/0/groups")) return { text: '[{"id":12345}]' };
    if (url.includes("groups/12345/items/")) return { text: "<div>Group library bibliography.</div>" };
    throw new Error("Unexpected URL: " + url);
  };
  const group = await plugin.fetchBibliography("QWER5678");
  assert.match(group.html, /Group library/);
  assert.equal(group.scope, "groups/12345");

  requestHandler = async () => { throw Object.assign(new Error("403 Forbidden"), { status: 403 }); };
  const fallback = await plugin.resolveReference({ key: "OFFL1234", offsets: [0], fallback: "*Journal* **7**" }, true);
  assert.equal(fallback.source, "footnote");
  assert.equal(fallback.plain, "Journal 7");

  // Match Pandoc Reference List: open through activeWindow in the same
  // synchronous click turn, not an asynchronous Electron shell request.
  const opened = [];
  const previousActiveWindow = globalThis.activeWindow;
  globalThis.activeWindow = { open: (...args) => { opened.push(args); return {}; } };
  try {
    plugin.openZoteroItem({ key: "QWER5678", scope: "groups/12345" });
    plugin.openZoteroItem({ key: "3FT52DT7", scope: "users/0" });
    plugin.openZoteroItem({ key: "OFFL1234", scope: null });
  } finally {
    if (previousActiveWindow === undefined) delete globalThis.activeWindow;
    else globalThis.activeWindow = previousActiveWindow;
  }
  assert.deepEqual(opened, [
    ["zotero://select/groups/12345/items/QWER5678", "_blank"],
    ["zotero://select/library/items/3FT52DT7", "_blank"],
    ["zotero://select/library/items/OFFL1234", "_blank"],
  ]);

  process.stdout.write("Parser, reference-list UI, Zotero API and deep-link regression checks passed.\n");
})().catch((error) => { console.error(error); process.exitCode = 1; });
