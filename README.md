# Auto Copy Selected Text (Exclude Input)

[English](#english) | [中文说明](#中文说明)

A Safari userscript that **automatically copies any selected text to the clipboard** — mouse, touch, and keyboard selections all work. Selections made inside inputs, textareas, and rich-text editors are ignored.

> Version 1.11.0 · License: MIT · Works on macOS Safari, iPhone / iPad Safari, and Chromium/Firefox userscript managers.

---

<a id="english"></a>
## English

### Features

| Feature | Details |
|---|---|
| Release-driven copying | Copies fire on release: finger lift, mouse-up, or key release. While you are actively dragging a selection, the moving stream of changes never triggers a copy |
| Touch (iPhone / iPad) | Long-press to select, long-press-drag to extend, or tap the selection — the copy fires the instant you lift. If iOS takes over the touch stream mid-gesture (a long-press drag is sometimes hijacked by the native recognizer and the page never sees `touchend`), a `selectionchange` fallback completes the copy ~400 ms after the selection stops changing — no missed copies |
| Mouse selection | Copies synchronously inside the `mouseup` user gesture — the most reliable path under Safari's strict clipboard rules |
| Desktop double-click | Word selection applies after `mouseup`, so `dblclick` gets its own synchronous copy |
| Keyboard selection | Shift + Arrow / Home / End / PageUp / PageDown / Ctrl-⌘+A — copies the moment the selection key is released (plain scrolling keys never trigger) |
| Input exclusion (3 layers) | 1) document focus is editable -> skip; 2) event target (incl. Shadow DOM) is editable -> skip; 3) selection endpoints are editable -> skip. The focus check also prevents the WebKit pitfall where an input selection is invisible to `getSelection()` and a stale page selection gets copied by mistake |
| Clipboard strategy (3 tiers) | 1. `navigator.clipboard.writeText` (best, when the user gesture is still valid) 2. `document.execCommand('copy')` directly on the current selection — non-destructive, the selection and its handles survive 3. hidden-textarea fallback — last resort only; on iOS a restored programmatic selection has no native handles |
| Anti-noise | 1.5 s dedupe window for identical text; right / middle clicks ignored; collapsed selections ignored |
| Site blacklist | Optional `hostname` regex list to disable the script on specific sites |

### Install

**Safari (macOS & iOS) — Userscripts app**

1. Install the free, open-source [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) app.
2. macOS: Safari Settings -> Extensions -> Userscripts -> Allow (and grant "All websites").
   iOS: Settings -> Apps -> Safari -> Extensions -> Userscripts -> enable, allow all websites.
3. Add the script: open the Userscripts editor -> new script -> paste the contents of [`auto-copy-selected-text.user.js`](auto-copy-selected-text.user.js), or point the app's scripts directory at a synced folder containing the file.

**Chrome / Edge / Firefox**

Works with Tampermonkey or Violentmonkey: create a new script and paste the file contents. (Touch paths simply never fire on desktop.)

### Configuration

Edit the `CONFIG` block at the top of the script:

| Key | Default | Meaning |
|---|---|---|
| `DEBOUNCE_MS` | `400` | For selections whose release the page cannot see (native selection-handle drags, touch streams taken over by iOS): copy this long after the selection stops changing |
| `DEDUP_WINDOW_MS` | `1500` | Skip re-copying identical text within this window |
| `MIN_LENGTH` | `1` | Minimum trimmed length that triggers a copy |
| `DEBUG` | `false` | Verbose console logging under the `[auto-copy]` tag |
| `BLACKLIST` | `[]` | Array of hostname regexes, e.g. `[/^mail\.google\.com$/i]` |

### How it works

```
touchend  (finger lift)  --> copy immediately (primary path; may not fire if iOS
                              hijacks the touch stream mid-gesture)
mouseup   (left button)  --> copy immediately
dblclick                  --> copy immediately (desktop word selection)
keyup    (selection keys) --> copy immediately
selectionchange           --> fallback for releases the page cannot see (native
                              handle drags, hijacked long-press drags): copy 400 ms
                              after the selection stops changing; a new touch
                              cancels any pending fallback copy
```

Every copy passes three editable-area checks (focus -> event target -> selection endpoints) before touching the clipboard. Duplicate text within the dedupe window is skipped, and the dedupe marker is only set after a copy actually succeeds, so failures can be retried immediately.

### Notes

- `file://` pages are not matched (`@match *://*/*`).
- On iOS, the system may show a one-time "Allow Paste" style confirmation for clipboard writes — grant it once per site.
- iOS platform limit: native selection-handle drags (and occasionally hijacked long-press drags) have no page-visible release, so the copy lands ~400 ms after the selection stops changing. Pauses longer than 400 ms mid-drag may copy intermediate text; the final copy always supersedes it — tap the selection right after releasing to copy instantly instead.
- No external network requests; everything runs locally.

---

<a id="中文说明"></a>
## 中文说明

一个 Safari 用户脚本：**选中文字后自动复制到剪贴板**——鼠标、触屏、键盘选择都支持；在输入框、文本域、富文本编辑器里的选区不会触发复制。

### 功能特点

| 功能 | 说明 |
|---|---|
| 松手驱动 | 松手即复制：手指抬起、鼠标松开、按键松开。拖动选区的过程中，连续的选区变化流不会触发复制 |
| 触屏（iPhone / iPad） | 长按选词、长按拖选、轻点选区——抬手瞬间复制。若 iOS 在手势中途接管触摸流（长按拖选有时被原生手势识别器劫持，页面收不到 `touchend`），`selectionchange` 兜底会在选区停止变化约 400ms 后完成复制——**不会漏复制** |
| 鼠标选择 | 在 `mouseup` 用户手势上下文里**同步**复制——Safari 对剪贴板手势校验严格，同步路径成功率最高 |
| 桌面双击 | 双击选词在 `mouseup` 之后才生效，`dblclick` 单独补一次同步复制 |
| 键盘选择 | Shift + 方向键 / Home / End / PageUp / PageDown / Ctrl-⌘+A——松开选择键的瞬间复制（普通滚动键永不触发） |
| 输入框排除（三道防线） | 1) 焦点在可编辑区域 -> 跳过；2) 事件落点（含 Shadow DOM）在可编辑区域 -> 跳过；3) 选区起点/终点在可编辑区域 -> 跳过。焦点检查同时规避了 WebKit 的坑：输入框内的选区对 `getSelection()` 不可见，页面残留旧选区会被误复制 |
| 剪贴板策略（三级） | 1. `navigator.clipboard.writeText`（手势有效时最优）2. 对当前选区直接 `execCommand('copy')`——**不破坏选区**，手柄保留 3. 隐藏 textarea 兜底——最后手段；iOS 上恢复的编程选区没有原生手柄 |
| 防干扰 | 相同内容 1.5 秒内去重；右键/中键不触发；空选区不触发 |
| 站点黑名单 | 可选的 `hostname` 正则列表，在指定站点停用 |

### 安装

**Safari（macOS 和 iOS）— Userscripts 应用**

1. 安装免费开源的 [Userscripts](https://apps.apple.com/app/userscripts/id1463298887)。
2. macOS：Safari 设置 -> 扩展 -> Userscripts -> 允许（并勾选「所有网站」）。
   iOS：设置 -> App -> Safari -> 扩展 -> Userscripts -> 打开并允许所有网站。
3. 添加脚本：打开 Userscripts 编辑器 -> 新建脚本 -> 粘贴 [`auto-copy-selected-text.user.js`](auto-copy-selected-text.user.js) 的内容；或把应用的脚本目录指向一个含本文件的同步文件夹。

**Chrome / Edge / Firefox**

Tampermonkey 或 Violentmonkey 新建脚本粘贴即可（桌面端触屏路径自然不触发）。

### 配置

编辑脚本顶部的 `CONFIG`：

| 键 | 默认值 | 含义 |
|---|---|---|
| `DEBOUNCE_MS` | `400` | 用于页面看不到「松手」的选区（原生选择手柄拖动、被 iOS 接管的触摸流）：选区停止变化该时长后复制 |
| `DEDUP_WINDOW_MS` | `1500` | 相同内容在该时间窗内不重复复制 |
| `MIN_LENGTH` | `1` | 触发复制的最少字符数（去首尾空白） |
| `DEBUG` | `false` | 控制台输出 `[auto-copy]` 详细日志 |
| `BLACKLIST` | `[]` | 主机名正则数组，如 `[/^mail\.google\.com$/i]` |

### 工作原理

```
touchend（手指抬起）   --> 立即复制（主路径；手势被 iOS 接管时不会触发）
mouseup（左键松开）    --> 立即复制
dblclick（双击）       --> 立即复制（桌面选词）
keyup（选择相关按键）  --> 立即复制
selectionchange        --> 兜底：页面看不到松手的场景（原生手柄拖动、被接管的长按
                           拖选），选区停止变化 400ms 后复制；新手触摸会取消未决复制
```

每次复制前经过三道可编辑区域检查（焦点 -> 事件落点 -> 选区端点）。去重标记只在复制**成功后**更新，失败可立即重试。

### 备注

- 不匹配 `file://` 页面（`@match *://*/*`）。
- iOS 上系统可能弹出一次性的剪贴板写入确认，按站点允许一次即可。
- iOS 平台限制：原生手柄拖动（以及偶尔被接管的长按拖选）没有页面可见的松手信号，复制在选区停止变化约 400ms 后落地；拖动中途停顿超过 400ms 可能复制到中间状态，但最终复制总会覆盖它——松手后立刻轻点选区可立即复制。
- 无任何外部网络请求，全部本地运行。

---

## License / 许可证

[MIT](LICENSE)
