# Zotero Citations Reference Sidebar：Obsidian 参考文献侧栏

[English](README.md) | **简体中文**

这是一个为 [Zotero Citations](https://github.com/WesternGua/obsidian-zotero-citations) 开发的非官方 Obsidian 桌面插件：**保留 Zotero Citations 的原有脚注，同时在右侧自动显示参考文献列表,可以快速找到zotero对应的文献**。

**当前版本：** v0.3.2。**安装方式：** 手动安装（目前尚未上架 Obsidian 社区插件市场）。

## 功能特色

- 自动识别当前 Markdown 笔记中的 Zotero Citations 隐藏标记，按首次引用顺序列出文献，相同文献自动去重。
- 通过 Zotero **桌面版本地 API** 获取完整书目信息，并使用可配置的 CSL 样式格式化（默认 APA）。
- 在右侧栏显示紧凑、带编号的 References 列表。
- **点击文献文字**跳转到笔记中的首次引用；点击右侧 **↗** 箭头，在 Zotero 中打开并定位该文献。
- 切换、编辑笔记时自动刷新，并提供搜索、手动刷新和复制纯文本功能。
- 支持 Zotero 个人文库与群组文库。
- Zotero 暂时无法连接时显示已缓存的书目信息；如无缓存，则尝试显示脚注中的原文。
- **不改写原有脚注、不修改 Markdown 笔记，也不会写入 Zotero 文库**。

本插件是一个**独立的兼容插件**，并非 Zotero Citations 或 Pandoc Reference List 的修改版。

## 系统要求

| 组件 | 要求 |
| --- | --- |
| Obsidian | **1.5.7 或更高版本的桌面版**（Windows / macOS / Linux） |
| Zotero | 电脑上安装 Zotero 桌面版；需要获取最新书目信息时应保持运行 |
| Zotero Citations | 推荐安装，用于插入本插件能识别的脚注引用 |
| Pandoc / Better BibTeX | **不需要** |

## 安装方法

1. 下载[预编译安装包](dist/zotero-citations-reference-sidebar-v0.3.2.zip)，或从仓库根目录分别下载 `main.js`、`manifest.json`、`styles.css`。
2. 将 ZIP 解压，确保这三个文件放在名为 **`zotero-citations-reference-sidebar`** 的文件夹中。
3. 打开你的 Obsidian **仓库（Vault）** 目录，进入 `.obsidian/plugins/` 文件夹。`.obsidian` 通常是隐藏目录；如果没有 `plugins` 文件夹可以自行创建。
4. 将整个插件文件夹放入，最终结构应为：

   ```text
   你的 Obsidian 仓库/
   └── .obsidian/
       └── plugins/
           └── zotero-citations-reference-sidebar/
               ├── main.js
               ├── manifest.json
               └── styles.css
   ```

5. 重启 Obsidian（或重新加载社区插件），在 **设置 → 第三方插件/社区插件** 中启用 **Zotero Citations Reference Sidebar**。
6. 打开带有 Zotero Citations 引用的 Markdown 笔记，点击 Obsidian 左侧功能区的**双引号图标**；或者按 `Ctrl/Cmd + P`，搜索 **`Zotero References`**，打开右侧参考文献列表。

**升级旧版：** 在 Obsidian 中禁用此插件，覆盖原插件目录中的 `main.js`、`manifest.json`、`styles.css`，重启并重新启用。插件 ID 和已保存的设置不变。

## Zotero 配置

1. 启动 Zotero 桌面版。
2. 打开 **设置 → 高级**。
3. 勾选 **Allow other applications on this computer to communicate with Zotero**（允许此计算机上的其他应用程序与 Zotero 通信）。
4. 获取新的或更新的参考文献信息时，请保持 Zotero 运行。

Zotero 本地 API 的默认地址为 `http://127.0.0.1:23119/api/`。本插件仅通过本地接口读取文献，**不需要 Zotero 网页 API Key**。详见 [Zotero 官方本地 API 文档](https://www.zotero.org/support/dev/web_api/v3/local_api)。

### 插件设置说明

打开 **Obsidian → 设置 → Zotero Citations Reference Sidebar**：

| 设置项 | 默认值 | 说明 |
| --- | --- | --- |
| Zotero 本地端口 | `23119` | Zotero 本地服务端口 |
| 参考文献样式（CSL） | `apa` | 可以改为 `nature`、`vancouver` 等 |
| 语言区域 | `en-US` | 可以尝试 `zh-CN` |
| 同时搜索 Zotero 群组文献库 | 开启 | 个人文库找不到时自动搜索可访问的群组文库 |

## 引用格式与工作原理

本插件识别的是 **Zotero Item Key（文献条目 ID）**，不是 Better BibTeX 的 Citation Key。例如，Zotero Citations 插入的脚注可能是：

```markdown
参考图 3a ^[<!-- zotero:3FT52DT7: --> Greiner, N. *et al.*
*Nat Commun* **12**, 435 (2021).<!-- /zotero-citation -->]
```

其中 `3FT52DT7` 是该文献的 Zotero Item Key。插件提取 `<!-- zotero:... -->` 隐藏标记中的 Key，从 Zotero 本地 API 读取文献，并显示到侧栏。原来的 `^[...]` 脚注**完全保留**。

**不识别**普通 Pandoc 引用，例如 `[@greiner2021]`。如果你使用 Pandoc 引用格式，请继续使用 Pandoc Reference List。目前重点适配单文献引用标记，复杂的多文献引用簇可能需要进一步支持。

## 侧栏操作

| 操作 | 结果 |
| --- | --- |
| 点击参考文献文字 | 跳转至当前笔记中这篇文献首次被引用的位置 |
| 点击右侧 **↗** | 在 Zotero 中打开并选中该文献 |
| 点击搜索图标 | 筛选当前笔记的文献 |
| 点击刷新图标 | 重新向 Zotero 读取参考文献 |
| 点击复制图标 | 复制当前参考文献列表的纯文本 |


## 隐私、限制与开发

- 插件只对本机 **`127.0.0.1`** 发起只读 HTTP 请求，不向第三方上传文献，也不会修改 Zotero 文库。
- 读取的参考文献信息会缓存在 Obsidian 的本地插件数据中。私有文献库的用户不应公开分享该缓存文件。
- 不修改笔记内容，不会在文章末尾插入参考文献列表，也不会导出 Word 文档。
- 如果不同文库恰好出现相同的 Zotero Item Key，优先查找个人文库。
- 只支持 **Obsidian 桌面版**。复制操作为纯文本，不保留斜体等富文本格式。

## 开源许可证

本插件采用 [MIT License](LICENSE) 开源。
