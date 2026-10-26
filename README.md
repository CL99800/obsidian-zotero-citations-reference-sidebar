# Zotero Citations Reference Sidebar for Obsidian

**English** | [简体中文](README.zh-CN.md)

An unofficial, desktop-only Obsidian companion plugin for [Zotero Citations](https://github.com/WesternGua/obsidian-zotero-citations). It adds a live **References** sidebar while preserving Zotero Citations' existing footnotes，Click the arrow to quickly locate the reference in Zotero and start reading.

**Version:** 0.3.2 · **Status:** Manual installation (not currently listed in Obsidian's Community Plugins browser).

## Features

- Detects Zotero Citations markers in the active Markdown note; lists each referenced item once, in first-citation order.
- Fetches complete, CSL-formatted bibliography entries from Zotero's **local desktop API** (default style: APA).
- Displays a compact, numbered reference list in the right sidebar.
- Click a reference to jump to its first occurrence in the note, or **↗** to open/select the item in Zotero.
- Automatically updates on note switches/edits; includes search, refresh, and copy-as-plain-text buttons.
- Supports personal and group Zotero libraries.
- Uses previously cached entries when Zotero is unavailable; otherwise falls back to the original footnote text.
- Does **not** modify Markdown notes, existing Zotero Citations footnotes, or the Zotero library.

This is a **separate plugin**, not a modification of Zotero Citations or Pandoc Reference List.

## Requirements

| Component | Requirement |
| --- | --- |
| Obsidian | **Desktop version 1.5.7+** (Windows, macOS, Linux) |
| Zotero | Desktop app on the same computer, running when new bibliography data is needed |
| Zotero Citations | Recommended to insert citations in the supported format |
| Pandoc / Better BibTeX | **Not required** |

## Installation

1. Download the [prebuilt installation ZIP](dist/zotero-citations-reference-sidebar-v0.3.2.zip), or download `main.js`, `manifest.json`, and `styles.css` from the repository root.
2. Extract the ZIP. The three plugin files must be in a folder named **`zotero-citations-reference-sidebar`**.
3. Open your Obsidian vault folder. Go to `.obsidian/plugins/` (create `plugins` if necessary; `.obsidian` may be hidden).
4. Copy the plugin folder there. The resulting directory must be:

   ```text
   YOUR_VAULT/
   └── .obsidian/
       └── plugins/
           └── zotero-citations-reference-sidebar/
               ├── main.js
               ├── manifest.json
               └── styles.css
   ```

5. Restart Obsidian or reload community plugins. Open **Settings → Community plugins**, and enable **Zotero Citations Reference Sidebar**.
6. Open a Markdown note with Zotero Citations footnotes. Click the **quotation-mark icon** in Obsidian's left ribbon, or press `Ctrl/Cmd + P` and search for **`Zotero References`** to open the right sidebar.

**Updating:** Disable the installed plugin, replace its `main.js`, `manifest.json`, and `styles.css`, restart Obsidian, and enable it again. The plugin ID and stored settings are unchanged.

## Configure Zotero

1. Start Zotero desktop.
2. Open **Settings → Advanced**.
3. Enable **“Allow other applications on this computer to communicate with Zotero.”**
4. Keep Zotero running when you want the sidebar to fetch new or updated entries.

Zotero normally exposes its local API on `http://127.0.0.1:23119/api/`. The sidebar only performs **read requests**, which do not need a Zotero Web API key. See the [official Zotero Local API documentation](https://www.zotero.org/support/dev/web_api/v3/local_api).

### Plugin settings

Open **Obsidian → Settings → Zotero Citations Reference Sidebar**:

| Setting | Default | Description |
| --- | --- | --- |
| Zotero local port | `23119` | Port used by Zotero desktop |
| CSL style | `apa` | For example `nature` or `vancouver` |
| Locale | `en-US` | For example `zh-CN` |
| Search group libraries | Enabled | Searches accessible group libraries if an item is not in the personal library |

## Supported citation format

The sidebar reads **Zotero item keys**, not Better BibTeX citation keys. For example:

```markdown
See Figure 3a ^[<!-- zotero:3FT52DT7: --> Greiner, N. *et al.*
*Nat Commun* **12**, 435 (2021).<!-- /zotero-citation -->]
```

Here `3FT52DT7` is the Zotero item key. The plugin reads the hidden marker and looks up the bibliography entry while leaving the `^[...]` footnote unchanged.

Standard Pandoc citations such as `[@greiner2021]` are **not recognized**. If you use Pandoc citation syntax, consider Pandoc Reference List instead. The current parser primarily supports single-item Zotero Citations markers; complex multi-item clusters may need additional support.

## Sidebar controls

| Action | Result |
| --- | --- |
| Click reference text | Jump to the item's first citation in the current note |
| Click **↗** | Open/select the item in Zotero |
| Search icon | Filter this note's reference list |
| Refresh icon | Re-fetch bibliography entries from Zotero |
| Copy icon | Copy all references as plain text |

For personal items, the plugin uses `zotero://select/library/items/ITEMKEY`. For known group items, it uses `zotero://select/groups/GROUPID/items/ITEMKEY`. If Zotero is offline and the group is unknown, the button first tries the **personal library**.

The plugin caches formatted entries for faster display. When Zotero is inaccessible, it can show cached data; on a first-time offline lookup, it shows the citation text stored in the note, which may be abbreviated and **is not necessarily a full bibliography entry**.

## Privacy, limitations, and development

- All bibliography HTTP requests target **`127.0.0.1` only**; no reference data is uploaded to a remote service or written back to Zotero.
- Bibliography entries are cached in local Obsidian plugin data. Do not publicly share that cache if your library is private.
- The plugin does not append a bibliography to notes, export Word files, or modify existing footnotes.
- If different libraries contain the same Zotero item key, the personal library is searched first.
- Desktop Obsidian only. The copy action produces plain text, without italics/rich formatting.
- Most sidebar interface labels are currently in Chinese. English users can find the sidebar via its quote icon or the `Zotero References` command search term.


## License

Released under the [MIT License](LICENSE).
