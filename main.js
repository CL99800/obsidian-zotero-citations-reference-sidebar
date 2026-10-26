"use strict";

const {
  Plugin,
  ItemView,
  PluginSettingTab,
  Setting,
  Notice,
  requestUrl,
  setIcon,
} = require("obsidian");

const VIEW_TYPE = "zotero-citations-reference-sidebar";
const SIDEBAR_ICON = "quote";
const DEFAULT_SETTINGS = {
  port: 23119,
  style: "apa",
  locale: "en-US",
  searchGroupLibraries: true,
};
const CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const MAX_CACHE_ITEMS = 1200;

// Preserve source offsets while skipping fenced Markdown code examples.
function maskFencedCode(markdown) {
  const lines = markdown.match(/[^\n]*\n|[^\n]+$/g) || [];
  let inFence = null;
  return lines.map((line) => {
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (!inFence && opening) {
      inFence = { symbol: opening[1][0], length: opening[1].length };
      return line.replace(/[^\n]/g, " ");
    }
    if (inFence) {
      const closing = new RegExp("^ {0,3}" + (inFence.symbol === "`" ? "`" : "~") + "{" + inFence.length + ",}(?:\\s*)$");
      if (closing.test(line.replace(/\n$/, ""))) inFence = null;
      return line.replace(/[^\n]/g, " ");
    }
    return line;
  }).join("");
}

function inInlineCode(markdown, index) {
  const lineStart = markdown.lastIndexOf("\n", index - 1) + 1;
  const prefix = markdown.slice(lineStart, index);
  const ticks = prefix.match(/(?<!\\)`+/g) || [];
  const counters = new Map();
  for (const run of ticks) counters.set(run.length, (counters.get(run.length) || 0) + 1);
  return [...counters.values()].some((count) => count % 2 === 1);
}

function parseZoteroCitations(markdown) {
  const masked = maskFencedCode(markdown);
  const markers = /<!--\s*zotero:([\s\S]*?)-->/gi;
  const entries = [];
  const byKey = new Map();
  let match;

  while ((match = markers.exec(masked)) !== null) {
    if (inInlineCode(masked, match.index)) continue;

    // Zotero Citations' documented syntax is zotero:ITEMKEY:locator.
    // A comma/semicolon-separated key field is accepted as a defensive extension.
    const keyField = match[1].split(":", 1)[0].trim();
    const keys = keyField.match(/\b[A-Z0-9]{8}\b/gi) || [];
    if (!keys.length) continue;

    const endMarker = /<!--\s*\/zotero-citation\s*-->/gi;
    endMarker.lastIndex = match.index + match[0].length;
    const ending = endMarker.exec(masked);
    const nextOpening = masked.indexOf("<!-- zotero:", match.index + match[0].length);
    let fallback = "";
    if (ending && ending.index - match.index < 16000 && (nextOpening < 0 || ending.index < nextOpening)) {
      fallback = markdown.slice(match.index + match[0].length, ending.index).trim();
    }

    for (const rawKey of keys) {
      const key = rawKey.toUpperCase();
      if (byKey.has(key)) {
        const entry = byKey.get(key);
        entry.offsets.push(match.index);
        if (!entry.fallback && fallback) entry.fallback = fallback;
      } else {
        const entry = { key, offsets: [match.index], fallback };
        byKey.set(key, entry);
        entries.push(entry);
      }
    }
  }
  return entries;
}

function markdownToPlain(markdown) {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!?\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|\*|_/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildZoteroItemUri(key, scope) {
  if (!/^[A-Z0-9]{8}$/.test(key || "")) return null;
  const group = /^groups\/(\d+)$/.exec(scope || "");
  if (group) return `zotero://select/groups/${group[1]}/items/${key}`;
  // Zotero Citations already provides a native Zotero item key. It is enough
  // to open the personal-library item even if the bibliography API is offline.
  return `zotero://select/library/items/${key}`;
}

function htmlToPlain(markup) {
  if (typeof DOMParser === "undefined") return markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const doc = new DOMParser().parseFromString(markup, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

// Zotero returns CSL HTML; allow formatting, but never inject HTML or event handlers.
function appendSanitizedHtml(parent, markup) {
  const doc = new DOMParser().parseFromString(markup, "text/html");
  const allowed = new Set(["DIV", "P", "SPAN", "EM", "I", "STRONG", "B", "SUP", "SUB", "BR", "A"]);
  const forbidden = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "SVG", "MATH", "FORM", "INPUT"]);
  function copyNode(node, target) {
    if (node.nodeType === 3) { target.appendChild(document.createTextNode(node.nodeValue || "")); return; }
    if (node.nodeType !== 1 || forbidden.has(node.tagName)) return;
    if (!allowed.has(node.tagName)) {
      for (const child of node.childNodes) copyNode(child, target);
      return;
    }
    const el = document.createElement(node.tagName.toLowerCase());
    if (node.tagName === "A") {
      const href = node.getAttribute("href") || "";
      try {
        const url = new URL(href);
        if (url.protocol === "http:" || url.protocol === "https:") {
          el.setAttribute("href", url.href);
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener noreferrer");
        }
      } catch (_) { /* Discard malformed link targets. */ }
    }
    for (const child of node.childNodes) copyNode(child, el);
    target.appendChild(el);
  }
  for (const child of doc.body.childNodes) copyNode(child, parent);
}

function makeButton(label, icon, title, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "zcr-icon-button";
  button.setAttribute("aria-label", title);
  button.title = title;
  if (icon && typeof setIcon === "function") setIcon(button, icon);
  else button.textContent = label;
  button.addEventListener("click", action);
  return button;
}

class ReferenceSidebarView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.query = "";
    this.current = null;
    this.items = [];
  }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Zotero References"; }
  getIcon() { return SIDEBAR_ICON; }

  async onOpen() {
    const root = this.contentEl;
    root.replaceChildren();
    root.classList.add("zcr-view");

    const toolbar = document.createElement("div");
    toolbar.className = "zcr-toolbar";
    const title = document.createElement("span");
    title.className = "zcr-title";
    title.textContent = "References ";
    this.countEl = document.createElement("span");
    this.countEl.className = "zcr-count";
    this.countEl.textContent = "0";
    title.appendChild(this.countEl);
    toolbar.appendChild(title);
    const actions = document.createElement("div");
    actions.className = "zcr-actions";
    actions.appendChild(makeButton("搜索", "search", "搜索参考文献", () => {
      this.searchEl.hidden = !this.searchEl.hidden;
      if (!this.searchEl.hidden) this.searchEl.focus();
      else { this.searchEl.value = ""; this.query = ""; this.renderList(); }
    }));
    actions.appendChild(makeButton("↻", "refresh-cw", "刷新 Zotero 参考文献", () => this.plugin.scheduleRefresh(0, true)));
    actions.appendChild(makeButton("复制", "copy", "复制参考文献列表", () => this.copyAll()));
    toolbar.appendChild(actions);
    root.appendChild(toolbar);

    this.searchEl = document.createElement("input");
    this.searchEl.type = "search";
    this.searchEl.className = "zcr-search";
    this.searchEl.placeholder = "搜索本篇笔记的文献…";
    this.searchEl.setAttribute("aria-label", "搜索参考文献");
    this.searchEl.hidden = true;
    this.searchEl.addEventListener("input", () => { this.query = this.searchEl.value.toLowerCase().trim(); this.renderList(); });
    root.appendChild(this.searchEl);

    this.statusEl = document.createElement("div");
    this.statusEl.className = "zcr-status";
    root.appendChild(this.statusEl);
    this.listEl = document.createElement("div");
    this.listEl.className = "zcr-list";
    root.appendChild(this.listEl);
    this.plugin.scheduleRefresh(0);
  }

  showLoading(file) {
    if (!this.current || this.current !== file?.path) {
      this.statusEl.textContent = "正在读取当前笔记…";
    }
  }

  display(file, items, status) {
    this.current = file ? file.path : null;
    this.items = items;
    this.countEl.textContent = String(items.length);
    this.statusEl.textContent = status;
    this.renderList();
  }

  renderList() {
    if (!this.listEl) return;
    this.listEl.replaceChildren();
    const visible = this.items.filter((x) => !this.query || (x.key + " " + x.plain).toLowerCase().includes(this.query));
    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "zcr-empty";
      empty.textContent = this.items.length ? "没有匹配的文献。" : "当前笔记没有识别到 Zotero Citations 引用。请确认引用中保留了 <!-- zotero:ITEMKEY:... --> 标记。";
      this.listEl.appendChild(empty);
      return;
    }

    visible.forEach((entry) => {
      const card = document.createElement("div");
      card.className = "zcr-entry";

      const number = document.createElement("span");
      number.className = "zcr-entry-number";
      number.textContent = `${this.items.indexOf(entry) + 1}.`;
      card.appendChild(number);

      const content = document.createElement("div");
      content.className = "zcr-entry-content";
      content.tabIndex = 0;
      content.setAttribute("role", "button");
      content.setAttribute("aria-label", `定位正文引用 ${entry.key}`);
      content.title = `点击定位正文引用 · ${entry.key}`;
      const jump = () => this.plugin.jumpToCitation(this.current, entry.offsets[0]);
      content.addEventListener("click", (event) => { if (event.target.closest("a")) return; jump(); });
      content.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); jump(); } });
      const body = document.createElement("div");
      body.className = "zcr-entry-body";
      if (entry.html) appendSanitizedHtml(body, entry.html);
      else body.textContent = entry.plain || `未找到文献 ${entry.key}`;
      content.appendChild(body);
      card.appendChild(content);

      const entryActions = document.createElement("div");
      entryActions.className = "zcr-entry-actions";
      const openButton = makeButton("↗", "external-link", "在 Zotero 中打开该文献", (event) => {
        event.stopPropagation();
        this.plugin.openZoteroItem(entry);
      });
      if (!buildZoteroItemUri(entry.key, entry.scope)) {
        openButton.disabled = true;
        openButton.title = "无效的 Zotero 文献标识";
      } else if (!entry.scope) {
        openButton.title = "在 Zotero 中打开（未确认文库时先尝试个人文库）";
      }
      entryActions.appendChild(openButton);
      card.appendChild(entryActions);
      this.listEl.appendChild(card);
    });
  }

  async copyAll() {
    const text = this.items.map((entry, index) => `${index + 1}. ${entry.plain || entry.key}`).join("\n\n");
    if (!text) return new Notice("当前没有可复制的参考文献");
    try { await navigator.clipboard.writeText(text); new Notice("参考文献已复制"); }
    catch (_) { new Notice("无法访问剪贴板，请检查系统权限"); }
  }
}

class ReferenceSidebarSettings extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const container = this.containerEl;
    container.replaceChildren();
    new Setting(container).setName("Zotero 本地端口").setDesc("默认 23119。请保持 Zotero 运行，并在 Zotero → 设置 → 高级中允许本地 API 访问。")
      .addText((text) => text.setPlaceholder("23119").setValue(String(this.plugin.settings.port)).onChange(async (value) => {
        const n = Number(value);
        if (Number.isInteger(n) && n > 0 && n <= 65535) { this.plugin.settings.port = n; this.plugin.groupIds = null; await this.plugin.saveSettings(); this.plugin.scheduleRefresh(0, true); }
      }));
    new Setting(container).setName("参考文献样式（CSL）").setDesc("Zotero 的 CSL 样式 ID，例如 apa、vancouver、nature。")
      .addText((text) => text.setValue(this.plugin.settings.style).onChange(async (value) => {
        this.plugin.settings.style = value.trim() || "apa";
        await this.plugin.saveSettings(); this.plugin.scheduleRefresh(0, true);
      }));
    new Setting(container).setName("语言区域").setDesc("例如 en-US 或 zh-CN。部分 CSL 样式有固定语言。")
      .addText((text) => text.setValue(this.plugin.settings.locale).onChange(async (value) => {
        this.plugin.settings.locale = value.trim() || "en-US";
        await this.plugin.saveSettings(); this.plugin.scheduleRefresh(0, true);
      }));
    new Setting(container).setName("同时搜索 Zotero 群组文献库").setDesc("个人文库没有此 Item Key 时，尝试已加入的群组文库。")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.searchGroupLibraries).onChange(async (value) => {
        this.plugin.settings.searchGroupLibraries = value;
        await this.plugin.saveSettings(); this.plugin.scheduleRefresh(0, true);
      }));
    new Setting(container).setName("打开参考文献侧栏").addButton((button) => button.setButtonText("打开 References").onClick(() => this.plugin.activateView()));
    const note = document.createElement("p");
    note.textContent = "此插件仅读取带有 Zotero Citations 隐藏标记的笔记和 Zotero 本地接口，不改写原始引用。复制功能输出纯文本；详细安装说明见 README.md。";
    container.appendChild(note);
  }
}

class ZoteroCitationReferenceSidebar extends Plugin {
  async onload() {
    const stored = await this.loadData() || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored.settings || {});
    this.cache = new Map(Object.entries(stored.cache || {}));
    this.failedUntil = new Map();
    this.groupIds = null;
    this.sequence = 0;
    this.lastFile = null;
    this.timer = null;
    this.saveTimer = null;
    this.forceNext = false;

    this.registerView(VIEW_TYPE, (leaf) => new ReferenceSidebarView(leaf, this));
    this.addRibbonIcon(SIDEBAR_ICON, "打开 Zotero References", () => this.activateView());
    this.addCommand({ id: "open-zotero-reference-sidebar", name: "打开 Zotero References 侧栏", callback: () => this.activateView() });
    this.addCommand({ id: "refresh-zotero-reference-sidebar", name: "刷新 Zotero References 侧栏", callback: () => this.scheduleRefresh(0, true) });
    this.addSettingTab(new ReferenceSidebarSettings(this.app, this));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.scheduleRefresh(200)));
    this.registerEvent(this.app.workspace.on("file-open", (file) => { if (file?.extension === "md") this.lastFile = file; this.scheduleRefresh(50); }));
    this.registerEvent(this.app.workspace.on("editor-change", () => this.scheduleRefresh(400)));
    this.registerEvent(this.app.vault.on("modify", (file) => { if (file?.path === this.lastFile?.path) this.scheduleRefresh(400); }));
    this.app.workspace.onLayoutReady(() => this.scheduleRefresh(0));
  }

  onunload() {
    if (this.timer) clearTimeout(this.timer);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }

  async saveSettings() { await this.saveData({ settings: this.settings, cache: this.cacheObject() }); }
  cacheObject() {
    const recent = [...this.cache.entries()].sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, MAX_CACHE_ITEMS);
    return Object.fromEntries(recent);
  }
  queueCacheSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.saveSettings().catch(() => {}); }, 1500);
  }

  async activateView() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      if (!leaf) return new Notice("无法创建右侧栏，请先打开 Obsidian 右侧栏");
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    this.scheduleRefresh(0);
  }

  scheduleRefresh(delay = 250, force = false) {
    this.forceNext = this.forceNext || force;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      const requestedForce = this.forceNext;
      this.forceNext = false;
      this.refresh(requestedForce).catch((error) => console.warn("Zotero References refresh failed", error));
    }, delay);
  }

  activeFile() {
    const current = this.app.workspace.getActiveFile();
    if (current?.extension === "md") this.lastFile = current;
    return this.lastFile;
  }

  async readCurrentFile(file) {
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    const editorLeaf = leaves.find((leaf) => leaf.view?.file?.path === file.path && leaf.view?.editor?.getValue);
    if (editorLeaf) return editorLeaf.view.editor.getValue();
    return this.app.vault.cachedRead(file);
  }

  async refresh(force) {
    const views = this.app.workspace.getLeavesOfType(VIEW_TYPE).map((leaf) => leaf.view).filter((view) => view instanceof ReferenceSidebarView);
    if (!views.length) return;
    const token = ++this.sequence;
    const file = this.activeFile();
    views.forEach((view) => view.showLoading(file));
    if (!file) { views.forEach((view) => view.display(null, [], "请打开一篇 Markdown 笔记")); return; }

    const markdown = await this.readCurrentFile(file);
    const references = parseZoteroCitations(markdown);
    if (!references.length) {
      if (token === this.sequence) views.forEach((view) => view.display(file, [], "当前笔记中找到 0 条 Zotero Citations 引用"));
      return;
    }

    const results = new Array(references.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(4, references.length) }, async () => {
      while (next < references.length) {
        const index = next++;
        results[index] = await this.resolveReference(references[index], force);
      }
    });
    await Promise.all(workers);
    if (token !== this.sequence) return;
    const offline = results.filter((entry) => entry.source !== "zotero").length;
    const status = `当前笔记 · ${results.length} 篇文献` + (offline ? ` · ${offline} 篇使用缓存或原文` : "");
    views.forEach((view) => view.display(file, results, status));
  }

  cacheKey(key) { return `${this.settings.port}|${this.settings.style}|${this.settings.locale}|${key}`; }
  async resolveReference(entry, force) {
    const cacheId = this.cacheKey(entry.key);
    const cached = this.cache.get(cacheId);
    const now = Date.now();
    // v0.1.0 cache entries predate the library-scope field. Re-resolve them
    // when possible so group-library links still point to the correct group.
    if (!force && cached?.scope && now - cached.at < CACHE_MAX_AGE_MS) {
      return { ...entry, html: cached.html, plain: htmlToPlain(cached.html), scope: cached.scope, source: "zotero" };
    }
    if (!force && (this.failedUntil.get(cacheId) || 0) > now) return this.makeFallback(entry, cached);

    try {
      const found = await this.fetchBibliography(entry.key);
      const html = found.html;
      if (!html || !htmlToPlain(html)) throw new Error("Empty bibliography");
      this.cache.set(cacheId, { html, scope: found.scope, at: Date.now() });
      if (this.cache.size > MAX_CACHE_ITEMS) {
        const oldest = [...this.cache.entries()].sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
        for (const [oldKey] of oldest.slice(0, this.cache.size - MAX_CACHE_ITEMS)) this.cache.delete(oldKey);
      }
      this.failedUntil.delete(cacheId);
      this.queueCacheSave();
      return { ...entry, html, plain: htmlToPlain(html), scope: found.scope, source: "zotero" };
    } catch (error) {
      this.failedUntil.set(cacheId, Date.now() + 30000);
      return this.makeFallback(entry, cached);
    }
  }

  makeFallback(entry, cached) {
    if (cached?.html) return { ...entry, html: cached.html, plain: htmlToPlain(cached.html), scope: cached.scope, source: "cache" };
    return { ...entry, html: null, plain: markdownToPlain(entry.fallback), scope: null, source: "footnote" };
  }

  async fetchBibliography(key) {
    const scope = ["users/0"];
    const personal = await this.tryScope(scope[0], key);
    if (personal) return personal;
    if (!this.settings.searchGroupLibraries) throw new Error("Item not in personal library");

    const groupIds = await this.getGroupIds();
    for (const id of groupIds) {
      const html = await this.tryScope(`groups/${id}`, key);
      if (html) return html;
    }
    throw new Error("Item not found in Zotero libraries");
  }

  async tryScope(scope, key) {
    const port = Number(this.settings.port);
    const url = `http://127.0.0.1:${port}/api/${scope}/items/${encodeURIComponent(key)}?format=bib&style=${encodeURIComponent(this.settings.style)}&locale=${encodeURIComponent(this.settings.locale)}`;
    try {
      const response = await requestUrl({ url, method: "GET" });
      return { html: response.text, scope };
    } catch (error) {
      if (error?.status === 404 || /\b404\b/.test(String(error?.message || ""))) return null;
      throw error;
    }
  }

  async getGroupIds() {
    if (this.groupIds) return this.groupIds;
    const response = await requestUrl({ url: `http://127.0.0.1:${Number(this.settings.port)}/api/users/0/groups`, method: "GET" });
    const groups = JSON.parse(response.text);
    this.groupIds = (Array.isArray(groups) ? groups : [])
      .map((group) => group.id ?? group.data?.id)
      .filter((id) => /^\d+$/.test(String(id)))
      .slice(0, 100);
    return this.groupIds;
  }

  openZoteroItem(entry) {
    const uri = buildZoteroItemUri(entry.key, entry.scope);
    if (!uri) return new Notice("无法识别 Zotero 文献标识");
    try {
      // Pandoc Reference List opens its BBT-supplied `item.select` URLs with
      // `activeWindow.open(zLink, '_blank')` directly in the click handler.
      // Use the same Obsidian window mechanism with our native item-key URL.
      // Keeping this synchronous preserves the click's user activation.
      const hostWindow = globalThis.activeWindow || globalThis.window;
      if (!hostWindow || typeof hostWindow.open !== "function") {
        throw new Error("Obsidian window.open is unavailable");
      }
      hostWindow.open(uri, "_blank");
    } catch (error) {
      console.warn("Zotero References: cannot open item URI", uri, error);
      new Notice("无法向 Zotero 发起跳转，请检查系统能否打开 zotero:// 链接");
    }
  }

  async jumpToCitation(path, offset) {
    if (!path) return;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) return;
    let leaf = this.app.workspace.getLeavesOfType("markdown").find((candidate) => candidate.view?.file?.path === path);
    if (!leaf) leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(file, { active: true });
    const editor = leaf.view?.editor;
    if (editor) {
      const position = editor.offsetToPos(Math.min(offset, editor.getValue().length));
      editor.setCursor(position);
      editor.scrollIntoView({ from: position, to: position }, true);
      editor.focus();
    }
  }
}

// Expose pure helpers for offline regression tests; Obsidian still loads the plugin class.
ZoteroCitationReferenceSidebar.testUtils = { parseZoteroCitations, maskFencedCode, markdownToPlain, buildZoteroItemUri, ReferenceSidebarView };
module.exports = ZoteroCitationReferenceSidebar;
