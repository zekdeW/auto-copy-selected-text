// ==UserScript==
// @name         Auto Copy Selected Text (Exclude Input)
// @description  选中文字后自动复制（输入框除外）；支持鼠标、触屏、键盘选择
// @match        *://*/*
// @grant        none
// @run-at       document-start
// @version      1.8.0
// @license      MIT
// @namespace    local.userscripts.auto-copy-selection
// ==/UserScript==

(function () {
    'use strict';

    // ====== 配置 ======
    const CONFIG = {
        DEBOUNCE_MS: 400,      // 触屏 / 键盘选择：选区停止变化多久后复制
        DEDUP_WINDOW_MS: 1500, // 相同内容在该时间窗内不重复写剪贴板
        MIN_LENGTH: 1,         // 去除首尾空白后的最少字符数
        DEBUG: false,          // true 时输出详细日志
    };

    // 在这些站点停用（匹配 location.hostname 的正则），例如：
    // const BLACKLIST = [/^mail\.google\.com$/i, /^(localhost|127\.0\.0\.1)$/];
    const BLACKLIST = [];

    const TAG = '[auto-copy]';
    const log = (...args) => { if (CONFIG.DEBUG) console.log(TAG, ...args); };

    let debounceTimer = null;
    let lastCopiedText = '';
    let lastCopiedAt = 0;

    // ====== 三条触发路径 ======

    // 1) 鼠标：在 mouseup 的用户手势上下文里“同步”复制。
    //    Safari 对剪贴板写入的手势校验很严，异步/延时调用常被拒，
    //    因此鼠标操作走同步路径，成功率最高。
    document.addEventListener('mouseup', function (event) {
        if (event.button !== 0) return; // 只处理左键
        clearTimeout(debounceTimer);
        const target = (event.composedPath && event.composedPath()[0]) || event.target;
        tryCopy(target); // 同步执行，保留手势上下文
    }, true); // 捕获阶段：部分网站 stopPropagation 也拦不住

    // 2) selectionchange：覆盖双击选词、三击选段、触屏拖动手柄、Shift+方向键。
    //    拖拽过程中会连续触发，靠防抖等到选区稳定后再复制。
    document.addEventListener('selectionchange', function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(tryCopy, CONFIG.DEBOUNCE_MS);
    });

    // 3) 触屏（iPhone/iPad）：长按选词、拖动选择手柄松手的瞬间（touchend）是
    //    真实的用户手势时刻——在此时同步复制。若只靠 selectionchange 防抖
    //    （400ms 后），手势已失效，iOS 会拒绝剪贴板写入。
    document.addEventListener('touchend', function (event) {
        clearTimeout(debounceTimer);
        const target = (event.composedPath && event.composedPath()[0]) || event.target;
        tryCopy(target); // 与 mouseup 相同的同步路径；空选区会自然跳过
    }, true);

    // ====== 核心逻辑 ======

    function tryCopy(triggerEl) {
        const selection = window.getSelection();

        // 防线一：焦点在输入框。WebKit / Firefox 中，输入框内部的选区不会出现在
        // document selection 上，此时 getSelection() 返回的可能还是页面上残留的
        // 旧选区——只看选区端点会误复制旧文本，必须先查焦点。
        const active = document.activeElement;
        if (active && isEditableNode(active)) {
            log('焦点位于输入框/可编辑区域，跳过');
            return;
        }

        // 防线二：本次触发事件的落点（含 Shadow DOM 内部）在输入框里
        if (triggerEl && isEditableNode(triggerEl)) {
            log('操作落点位于输入框/可编辑区域，跳过');
            return;
        }

        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

        // 防线三：选区起点/终点落在输入框或可编辑区域时跳过
        if (isEditableNode(selection.anchorNode) || isEditableNode(selection.focusNode)) {
            log('选区位于输入框/可编辑区域，跳过');
            return;
        }

        const text = selection.toString().trim();
        if (text.length < CONFIG.MIN_LENGTH) return;

        if (BLACKLIST.length && BLACKLIST.some(function (re) { return re.test(location.hostname); })) {
            log('黑名单站点，跳过:', location.hostname);
            return;
        }

        // 注意：去重标记在复制成功回调里更新；失败时允许马上重试
        copyText(text);
    }

    function markCopied(text) {
        lastCopiedText = text;
        lastCopiedAt = Date.now();
    }

    function shouldSkipDuplicate(text) {
        return text === lastCopiedText && Date.now() - lastCopiedAt < CONFIG.DEDUP_WINDOW_MS;
    }

    function isEditableNode(node) {
        let el = node;
        if (el && el.nodeType === Node.TEXT_NODE) el = el.parentElement;
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;

        // 向上遍历，穿过 Shadow DOM 宿主边界
        while (el) {
            const tag = el.tagName.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
            if (el.isContentEditable) return true;

            const root = typeof el.getRootNode === 'function' ? el.getRootNode() : document;
            el = (root && root.host) ? root.host : el.parentElement;
        }
        return false;
    }

    // 直接对当前 DOM 选区执行 execCommand('copy')：
    // 不需要隐藏 textarea、不触碰选区本身（复制后选区原样保留，手柄不丢）。
    // WebKit 的用户手势标记在手势结束后会短暂存续（约 1 秒），
    // 因此 400ms 防抖路径在 iOS 上通常也能成功。
    function tryExecCommandCopy() {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
        try {
            return document.execCommand('copy');
        } catch (err) {
            return false;
        }
    }

    function copyText(text) {
        // 短时间去重：双击→三击等连续动作不会把同一内容反复写进剪贴板历史
        if (shouldSkipDuplicate(text)) {
            log('短时间内重复内容，跳过');
            return;
        }

        // 三级策略，确保“拖完手柄一定能复制”：
        // 1) Clipboard API（手势有效时最优）
        // 2) 对当前选区直接 execCommand('copy')（不破坏选区）
        // 3) 隐藏 textarea 兜底（最后手段：会短暂破坏选区，恢复后无原生手柄）
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(function () {
                markCopied(text);
                log('已自动复制:', text);
            }, function (err) {
                log('Clipboard API 被拒:', err);
                if (tryExecCommandCopy()) {
                    markCopied(text);
                    log('已自动复制(execCommand 直拷):', text);
                } else {
                    fallbackCopy(text);
                }
            });
        } else if (tryExecCommandCopy()) {
            markCopied(text);
            log('已自动复制(execCommand 直拷):', text);
        } else {
            fallbackCopy(text);
        }
    }

    function fallbackCopy(text) {
        // 备份当前选区，复制后还原，避免隐藏 textarea 抢走选区高亮
        const selection = window.getSelection();
        const savedRanges = [];
        for (let i = 0; i < selection.rangeCount; i++) {
            savedRanges.push(selection.getRangeAt(i).cloneRange());
        }

        let textarea = null;
        try {
            textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', ''); // 防止移动端弹键盘
            textarea.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;';
            (document.body || document.documentElement).appendChild(textarea);
            textarea.select();
            textarea.setSelectionRange(0, text.length); // iOS 上必需

            const ok = document.execCommand('copy');
            if (ok) {
                markCopied(text);
                log('已自动复制(兜底):', text);
            } else {
                console.warn(TAG, 'execCommand 复制失败（可能缺少用户手势上下文）');
            }
        } catch (err) {
            console.error(TAG, '复制失败:', err);
        } finally {
            if (textarea) textarea.remove();
            if (savedRanges.length) {
                selection.removeAllRanges();
                savedRanges.forEach(function (range) { selection.addRange(range); });
            }
        }
    }

})();
