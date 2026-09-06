import * as monaco from 'monaco-editor';
import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';
import markedKatex from 'marked-katex-extension';
import 'katex/dist/katex.min.css';

// ----- config -----
const CONFIG = {
    scratchSaveDir: '~/Downloads',
    syncScroll: true,
    fullscreenPreviewMaxWidth: 85,   // max width of preview content in full-screen (in ch)
    fullscreenPreviewMaxWidthMin: 40,
    fullscreenPreviewMaxWidthMax: 250,
};

const customAlert = (message) => {
    return new Promise((resolve) => {
        const dialog = document.createElement('dialog');
        dialog.className = 'custom-dialog';
        dialog.innerHTML = `
            <div class="dialog-container">
                <p class="dialog-message">${escapeHtml(message)}</p>
                <div class="dialog-actions">
                    <button id="ok" class="dialog-button dialog-button-primary">OK</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
        dialog.showModal();

        const closeDialog = () => { resolve(); dialog.close(); dialog.remove(); };
        dialog.querySelector('#ok').onclick = closeDialog;
        dialog.onclose = closeDialog;
    });
};

const customConfirm = (message, confirmText = 'Confirm', cancelText = 'Cancel') => {
    return new Promise((resolve) => {
        const dialog = document.createElement('dialog');
        dialog.className = 'custom-dialog';
        dialog.innerHTML = `
            <div class="dialog-container">
                <p class="dialog-message">${escapeHtml(message)}</p>
                <div class="dialog-actions">
                    <button id="cancel" class="dialog-button dialog-button-default">${escapeHtml(cancelText)}</button>
                    <button id="confirm" class="dialog-button dialog-button-primary">${escapeHtml(confirmText)}</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
        dialog.showModal();

        const onConfirm = () => { resolve(true); dialog.close(); dialog.remove(); };
        const onCancel = () => { resolve(false); dialog.close(); dialog.remove(); };

        dialog.querySelector('#confirm').onclick = onConfirm;
        dialog.querySelector('#cancel').onclick = onCancel;
        dialog.onclose = onCancel;
    });
};

// Three-way save prompt: resolves 'save', 'discard' or 'cancel'.
// Escape and backdrop-close resolve 'cancel', so nothing is lost by dismissing it.
const customSaveConfirm = (message, saveText = 'Save', discardText = 'Don\'t Save') => {
    return new Promise((resolve) => {
        const dialog = document.createElement('dialog');
        dialog.className = 'custom-dialog';
        dialog.innerHTML = `
            <div class="dialog-container">
                <p class="dialog-message">${escapeHtml(message)}</p>
                <div class="dialog-actions">
                    <button id="cancel" class="dialog-button dialog-button-default dialog-button-left">Cancel</button>
                    <button id="discard" class="dialog-button dialog-button-default">${escapeHtml(discardText)}</button>
                    <button id="save" class="dialog-button dialog-button-primary">${escapeHtml(saveText)}</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
        dialog.showModal();

        const closeWith = (choice) => { resolve(choice); dialog.close(); dialog.remove(); };
        dialog.querySelector('#save').onclick = () => closeWith('save');
        dialog.querySelector('#discard').onclick = () => closeWith('discard');
        dialog.querySelector('#cancel').onclick = () => closeWith('cancel');
        dialog.onclose = () => closeWith('cancel');
    });
};

const customPrompt = (message, defaultValue = '') => {
    return new Promise((resolve) => {
        const dialog = document.createElement('dialog');
        dialog.className = 'custom-dialog';
        dialog.innerHTML = `
            <div class="dialog-container">
                <p class="dialog-message">${escapeHtml(message)}</p>
                <div class="dialog-input-container">
                    <input type="text" id="prompt-input" class="dialog-input" value="${escapeHtml(defaultValue)}">
                </div>
                <div class="dialog-actions">
                    <button id="cancel" class="dialog-button dialog-button-default">Cancel</button>
                    <button id="confirm" class="dialog-button dialog-button-primary">OK</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
        dialog.showModal();

        const input = dialog.querySelector('#prompt-input');
        input.focus();
        input.select();

        const onConfirm = () => {
            const value = input.value;
            resolve(value);
            dialog.close();
            dialog.remove();
        };

        const onCancel = () => {
            resolve(null);
            dialog.close();
            dialog.remove();
        };

        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                onConfirm();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
            }
        };

        dialog.querySelector('#confirm').onclick = onConfirm;
        dialog.querySelector('#cancel').onclick = onCancel;
        dialog.onclose = onCancel;
    });
};


// hash value that opens a new tab with the clipboard content instead of a file
const CLIPBOARD_HASH = '[clipboard]';

const decodeHash = (hash) => {
    const raw = hash.startsWith('#') ? hash.slice(1) : hash;
    try {
        return decodeURIComponent(raw);
    } catch (e) {
        return raw;
    }
};

// matches #[clipboard] and its encoded form #%5Bclipboard%5D
const isClipboardHash = (hash) => decodeHash(hash).trim().toLowerCase() === CLIPBOARD_HASH;

const escapeHtml = (unsafe) => {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

const encodeMermaidSource = (source) => encodeURIComponent(source);
const decodeMermaidSource = (value) => decodeURIComponent(value || '');

const replaceMermaidBlocks = (markdown) => {
    return markdown.replace(/```mermaid\s*\n([\s\S]*?)```/g, (match, code) => {
        return `<div class="mermaid" data-mermaid="${encodeMermaidSource(code)}">${escapeHtml(code)}</div>`;
    });
};

// Global CSS to hide Mermaid's own error overlays
const mermaidErrorStyle = document.createElement('style');
mermaidErrorStyle.innerHTML = `
    .mermaid-error, 
    #mermaid-error-container,
    .mermaid [id^="mermaid-error"] { 
        display: none !important; 
    }
`;
document.head.appendChild(mermaidErrorStyle);

const initializeMermaid = (dark) => {
    mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: dark ? 'dark' : 'default',
        suppressErrorOutput: true,
        errorLabels: false
    });
    // Hard-suppress error banners by overriding the global parseError handler
    mermaid.parseError = () => { };
};

const renderMermaidDiagrams = (container) => {
    if (!container) {
        return;
    }

    container.querySelectorAll('.mermaid').forEach(async (element) => {
        const source = element.dataset.mermaid;
        if (!source) {
            return;
        }

        const code = decodeMermaidSource(source);
        const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;

        try {
            // Validate syntax first.
            // If it fails, it will throw and we'll fall back to the catch block.
            await mermaid.parse(code);
            
            const result = await mermaid.render(id, code);
            const svg = result?.svg ?? result;
            element.innerHTML = svg;
        } catch (error) {
            // Silent failure: keep as code block
            element.innerHTML = `<pre class="language-mermaid">${escapeHtml(code)}</pre>`;
            // eslint-disable-next-line no-console
            console.warn('Mermaid syntax error, falling back to code block.', error);
        }
    });
};

marked.use(markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
    }
}));

marked.use(markedKatex({
    throwOnError: false,
    nonStandard: true
}));

const init = () => {
    let hasEdited = false;

    const STORAGE = {
        tabs: 'mlp.tabs',
        theme: 'mlp.theme',
        fullWidth: 'mlp.fullWidth',
        fullscreenPreviewMaxWidth: 'mlp.fullscreenPreviewMaxWidth',
        dividerRatio: 'mlp.dividerRatio',
        editorCollapsed: 'mlp.editorCollapsed',
        quoteMode: 'mlp.quoteMode',
        tabContent: (id) => 'mlp.tab.' + id,
        tabContentPrefix: 'mlp.tab.',
        tabScroll: (id) => 'mlp.tabScroll.' + id,
        tabScrollPrefix: 'mlp.tabScroll.',
        tabQuotes: (id) => 'mlp.quotes.' + id,
        tabQuotesPrefix: 'mlp.quotes.',
    };

    const readJSON = (key) => {
        try {
            const raw = localStorage.getItem(key);
            return raw == null ? null : JSON.parse(raw);
        } catch (e) {
            return null;
        }
    };

    const writeJSON = (key, value) => {
        localStorage.setItem(key, JSON.stringify(value));
    };

    // ----- tab state -----
    let tabs = [];
    let activeTabId = null;
    let dirtyTabs = new Set();
    let suppressDirty = false;
    let suppressScrollSave = false;
    // default template
    const defaultInput = `# Markdown syntax guide

## Headers

# This is a Heading h1
## This is a Heading h2
###### This is a Heading h6

## Emphasis

*This text will be italic*  
_This will also be italic_

**This text will be bold**  
__This will also be bold__

_You **can** combine them_

## Lists

### Unordered

* Item 1
* Item 2
* Item 2a
* Item 2b
    * Item 3a
    * Item 3b

### Ordered

1. Item 1
2. Item 2
3. Item 3
    1. Item 3a
    2. Item 3b

## Images

![This is an alt text.](/image/Markdown-mark.svg "This is a sample image.")

## Links

You may be using [Markdown Live Preview](https://markdownlivepreview.com/).

## Blockquotes

> Markdown is a lightweight markup language with plain-text-formatting syntax, created in 2004 by John Gruber with Aaron Swartz.
>
>> Markdown is often used to format readme files, for writing messages in online discussion forums, and to create rich text using a plain text editor.

## Tables

| Left columns  | Right columns |
| ------------- |:-------------:|
| left foo      | right foo     |
| left bar      | right bar     |
| left baz      | right baz     |

## Blocks of code

${"`"}${"`"}${"`"}
let message = 'Hello world';
alert(message);
${"`"}${"`"}${"`"}

## Mermaid diagrams

${"`"}${"`"}${"`"}mermaid
graph TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Finish]
  B -->|No| D[Alternate]
${"`"}${"`"}${"`"}

## Math formulas

Inline: $\\alpha \\approx 1/137$

Block:

$$
\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
$$

## Inline code

This web site is using ${"`"}markedjs/marked${"`"}.
`;

    self.MonacoEnvironment = {
        getWorker(_, label) {
            return new Proxy({}, { get: () => () => { } });
        }
    }

    let setupEditor = () => {
        initializeMermaid(false);
        let editor = monaco.editor.create(document.querySelector('#editor'), {
            fontSize: 14,
            language: 'markdown',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            scrollbar: {
                vertical: 'visible',
                horizontal: 'visible'
            },
            wordWrap: 'on',
            hover: { enabled: false },
            quickSuggestions: false,
            suggestOnTriggerCharacters: false,
            folding: false
        });

        editor.onDidChangeModelContent(() => {
            let changed = editor.getValue() != defaultInput;
            if (changed) {
                hasEdited = true;
            }
            let value = editor.getValue();
            convert(value);
            let current = getActiveTab();
            if (!current) return;
            if (current.filePath) {
                if (!suppressDirty && !dirtyTabs.has(current.id)) {
                    dirtyTabs.add(current.id);
                    renderTabs();
                }
            } else {
                saveScratchContent(current.id, value);
            }
        });

        let scrollSource = null;

        editor.onDidScrollChange((e) => {
            if (!CONFIG.syncScroll || scrollSource === 'preview') {
                return;
            }

            scrollSource = 'editor';
            const scrollTop = e.scrollTop;
            const scrollHeight = e.scrollHeight;
            const height = editor.getLayoutInfo().height;

            const maxScrollTop = scrollHeight - height;
            const scrollRatio = scrollTop / maxScrollTop;

            let previewElement = document.querySelector('#preview');
            let targetY = (previewElement.scrollHeight - previewElement.clientHeight) * scrollRatio;
            previewElement.scrollTo(0, targetY);
            requestAnimationFrame(() => { scrollSource = null; });
        });

        let previewElement = document.querySelector('#preview');
        previewElement.addEventListener('scroll', () => {
            if (activeTabId && !suppressScrollSave) {
                saveTabScroll(activeTabId, previewElement.scrollTop);
            }

            if (!CONFIG.syncScroll || scrollSource === 'editor') {
                return;
            }

            scrollSource = 'preview';
            const scrollRatio = previewElement.scrollTop / (previewElement.scrollHeight - previewElement.clientHeight);

            const scrollHeight = editor.getScrollHeight();
            const height = editor.getLayoutInfo().height;
            const maxScrollTop = scrollHeight - height;
            editor.setScrollTop(scrollRatio * maxScrollTop);
            requestAnimationFrame(() => { scrollSource = null; });
        });

        return editor;
    };

    // Render markdown text as html
    let convert = (markdown) => {
        let options = {
            headerIds: false,
            mangle: false
        };
        let html = marked.parse(replaceMermaidBlocks(markdown), options);
        let sanitized = DOMPurify.sanitize(html, {
            USE_PROFILES: { mathMl: true, html: true, svg: true },
            ADD_TAGS: ['semantics', 'annotation'],
            ADD_ATTR: ['class', 'data-mermaid', 'aria-hidden', 'encoding']
        });
        const output = document.querySelector('#output');
        output.innerHTML = sanitized;
        renderMermaidDiagrams(output);
        hideSelectionButton();
        applyQuoteHighlights(output);
    };

    let presetValue = (value) => {
        suppressDirty = true;
        editor.setValue(value);
        editor.revealPosition({ lineNumber: 1, column: 1 });
        editor.focus();
        hasEdited = false;
        suppressDirty = false;
    };

    // ----- tab system -----

    let getFilename = (filePath) => filePath.split('/').pop() || filePath;

    let getActiveTab = () => tabs.find((t) => t.id === activeTabId) || null;

    let nextScratchLabel = () => {
        let n = 1;
        let existing = new Set(tabs.filter((t) => !t.filePath).map((t) => t.label));
        while (existing.has('Tab ' + n)) n++;
        return 'Tab ' + n;
    };

    let saveTabList = () => {
        let persisted = tabs.map((t) => ({ id: t.id, filePath: t.filePath, label: t.label }));
        writeJSON(STORAGE.tabs, { tabs: persisted, activeId: activeTabId });
    };

    let loadTabList = () => {
        let data = readJSON(STORAGE.tabs);
        if (!data || !Array.isArray(data.tabs)) return { tabs: [], activeId: null };
        return { tabs: data.tabs, activeId: data.activeId || null };
    };

    let loadScratchContent = (tabId) => {
        return localStorage.getItem(STORAGE.tabContent(tabId));
    };

    let saveScratchContent = (tabId, content) => {
        localStorage.setItem(STORAGE.tabContent(tabId), content);
    };

    let removeScratchContent = (tabId) => {
        localStorage.removeItem(STORAGE.tabContent(tabId));
    };

    let loadTabScroll = (tabId) => {
        let raw = localStorage.getItem(STORAGE.tabScroll(tabId));
        if (raw == null) return null;
        let n = parseInt(raw, 10);
        return Number.isFinite(n) ? n : null;
    };

    let saveTabScroll = (tabId, scrollTop) => {
        localStorage.setItem(STORAGE.tabScroll(tabId), String(Math.round(scrollTop)));
    };

    let removeTabScroll = (tabId) => {
        localStorage.removeItem(STORAGE.tabScroll(tabId));
    };

    // scratch tabs are identified by a crypto.randomUUID(), file tabs by their path
    const SCRATCH_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    let cleanupOrphanScratchContent = () => {
        const liveIds = new Set(tabs.map((t) => t.id));
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            if (key.startsWith(STORAGE.tabContentPrefix)) {
                const id = key.slice(STORAGE.tabContentPrefix.length);
                if (!liveIds.has(id)) toRemove.push(key);
            } else if (key.startsWith(STORAGE.tabScrollPrefix)) {
                const id = key.slice(STORAGE.tabScrollPrefix.length);
                if (!liveIds.has(id)) toRemove.push(key);
            } else if (key.startsWith(STORAGE.tabQuotesPrefix)) {
                const id = key.slice(STORAGE.tabQuotesPrefix.length);
                if (!liveIds.has(id) && SCRATCH_ID_PATTERN.test(id)) toRemove.push(key);
            }
        }
        toRemove.forEach((k) => localStorage.removeItem(k));
    };

    let loadEditorCollapsed = () => {
        return localStorage.getItem(STORAGE.editorCollapsed) === 'true';
    };

    let saveEditorCollapsed = (collapsed) => {
        localStorage.setItem(STORAGE.editorCollapsed, String(collapsed));
    };

    let toggleEditorCollapsed = () => {
        let container = document.querySelector('#container');
        if (!container) return;
        let collapsed = container.classList.toggle('editor-collapsed');
        saveEditorCollapsed(collapsed);
    };

    let renderTabs = () => {
        let tabBar = document.querySelector('#tab-bar');
        if (!tabBar) return;
        tabBar.innerHTML = '';
        tabs.forEach((tab) => {
            let isDirty = dirtyTabs.has(tab.id);
            let el = document.createElement('div');
            el.className = 'tab' + (tab.id === activeTabId ? ' active' : '') + (isDirty ? ' dirty' : '');
            el.title = tab.filePath || tab.label;

            let label = document.createElement('span');
            label.className = 'tab-label';
            label.textContent = (isDirty ? '*' : '') + tab.label;
            el.appendChild(label);

            let close = document.createElement('span');
            close.className = 'tab-close';
            close.textContent = '\u00d7';
            close.addEventListener('click', (e) => {
                e.stopPropagation();
                closeTab(tab.id);
            });
            el.appendChild(close);

            el.addEventListener('click', () => {
                if (tab.id !== activeTabId) switchToTab(tab.id);
            });

            el.addEventListener('dblclick', (e) => {
                if (!el.classList.contains('active')) return;
                if (e.target.classList.contains('tab-close')) return;
                toggleEditorCollapsed();
            });

            tabBar.appendChild(el);
        });

        let addBtn = document.createElement('div');
        addBtn.className = 'tab tab-add';
        addBtn.textContent = '+';
        addBtn.title = 'New tab';
        addBtn.addEventListener('click', () => openScratchTab());
        tabBar.appendChild(addBtn);
    };

    let saveCurrentTabContent = () => {
        let current = getActiveTab();
        if (current && !current.filePath) {
            saveScratchContent(current.id, editor.getValue());
        }
    };

    let fetchFileContent = async (filePath) => {
        const response = await fetch('/api/read-file?path=' + encodeURIComponent(filePath));
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Unknown error');
        }
        return { content: data.content, resolvedPath: data.resolvedPath || filePath };
    };

    let writeFileContent = async (filePath, content) => {
        const response = await fetch('/api/write-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath, content: content })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Unknown error');
        }
    };

    let saveTab = async (tabId) => {
        let tab = tabs.find((t) => t.id === tabId);
        if (!tab) return false;

        let content = (tab.id === activeTabId) ? editor.getValue() : loadScratchContent(tab.id);

        if (tab.filePath) {
            // file tab - write to disk
            try {
                await writeFileContent(tab.filePath, content);
                dirtyTabs.delete(tab.id);
                renderTabs();
                return true;
            } catch (err) {
                await customAlert('Failed to save file: ' + err.message);
                return false;
            }
        } else {
            // scratch tab - download as .md file and convert to file tab
            let now = new Date();
            let pad = (n) => String(n).padStart(2, '0');
            let defaultFilename = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
                + '-' + pad(now.getHours()) + '-' + pad(now.getMinutes()) + '-' + pad(now.getSeconds()) + '.md';

            let filename = await customPrompt('Enter filename:', defaultFilename);
            if (!filename) return false;

            if (!filename.toLowerCase().endsWith('.md')) {
                filename += '.md';
            }

            // trigger browser download
            let blob = new Blob([content], { type: 'text/markdown' });
            let url = URL.createObjectURL(blob);
            let a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);

            // save to disk and convert scratch to file tab
            let savePath = CONFIG.scratchSaveDir + '/' + filename;
            try {
                await writeFileContent(savePath, content);
                let oldId = tab.id;
                removeScratchContent(oldId);
                migrateQuotes(oldId, savePath);
                tab.filePath = savePath;
                tab.label = filename;
                tab.id = savePath;
                if (activeTabId === oldId) {
                    activeTabId = savePath;
                    window.location.hash = encodeURIComponent(savePath);
                    let input = document.querySelector('#file-path-input');
                    if (input) input.value = savePath;
                    document.title = filename + ' - Markdown Live Preview';
                }
                saveTabList();
                renderTabs();
                return true;
            } catch (err) {
                await customAlert('Failed to save file to disk: ' + err.message);
                return false;
            }
        }
    };

    let scratchHasContent = (tabId) => {
        let tab = tabs.find((t) => t.id === tabId);
        if (!tab || tab.filePath) return false;
        let content = loadScratchContent(tabId);
        return content !== null && content !== undefined && content.trim() !== '';
    };

    // Returns true if it's ok to proceed, false if cancelled
    let confirmDirtyTab = async (tabId) => {
        let tab = tabs.find((t) => t.id === tabId);
        if (!tab) return true;

        if (tab.filePath && dirtyTabs.has(tabId)) {
            let choice = await customSaveConfirm('Save changes to ' + tab.label + '?');
            if (choice === 'cancel') return false;
            if (choice === 'save') {
                try {
                    await writeFileContent(tab.filePath, editor.getValue());
                    dirtyTabs.delete(tabId);
                    renderTabs();
                } catch (err) {
                    await customAlert('Failed to save file: ' + err.message);
                    return false;
                }
            } else {
                dirtyTabs.delete(tabId);
            }
        }
        return true;
    };

    let switchToTab = async (tabId) => {
        if (activeTabId && activeTabId !== tabId) {
            let ok = await confirmDirtyTab(activeTabId);
            if (!ok) return;
        }
        saveCurrentTabContent();
        if (activeTabId) {
            let previewElement = document.querySelector('#preview');
            if (previewElement) saveTabScroll(activeTabId, previewElement.scrollTop);
        }
        activeTabId = tabId;
        let tab = getActiveTab();
        if (!tab) return;

        // Read the saved scroll position BEFORE presetValue, because
        // presetValue -> editor.revealPosition -> sync-scroll fires the
        // preview scroll listener which would overwrite the stored value.
        let savedScroll = loadTabScroll(activeTabId);

        // Suppress scroll saves while we load content and restore position,
        // so sync-scroll side-effects don't clobber the saved value.
        suppressScrollSave = true;

        if (tab.filePath) {
            try {
                let result = await fetchFileContent(tab.filePath);
                presetValue(result.content);
                // update tab if path was normalised by server
                if (result.resolvedPath !== tab.filePath) {
                    migrateQuotes(tab.id, result.resolvedPath);
                    tab.filePath = result.resolvedPath;
                    tab.id = result.resolvedPath;
                    tab.label = getFilename(result.resolvedPath);
                    activeTabId = result.resolvedPath;
                    // Re-read scroll under the resolved ID in case it differs
                    savedScroll = loadTabScroll(activeTabId);
                    saveTabList();
                }
            } catch (err) {
                await customAlert('Failed to load file: ' + err.message);
            }
            window.location.hash = encodeURIComponent(tab.filePath);
            let input = document.querySelector('#file-path-input');
            if (input) input.value = tab.filePath;
        } else {
            let content = loadScratchContent(tab.id);
            presetValue(content !== null && content !== undefined ? content : '');
            window.location.hash = '';
            let input = document.querySelector('#file-path-input');
            if (input) input.value = '';
        }

        document.title = tab.label + ' - Markdown Live Preview';
        saveTabList();
        renderTabs();

        hideSelectionButton();
        refreshQuoteHighlights();
        refreshQuotesButton();

        if (savedScroll != null) {
            // setTimeout defers past any synchronous init code that runs after
            // switchToTab returns (e.g. setupDivider changing pane widths), and
            // the inner RAF ensures the browser has completed layout before we
            // set the scroll position.
            setTimeout(() => {
                requestAnimationFrame(() => {
                    let previewEl = document.querySelector('#preview');
                    if (previewEl) previewEl.scrollTop = savedScroll;
                    suppressScrollSave = false;
                });
            }, 0);
        } else {
            suppressScrollSave = false;
        }
    };

    let openFileTab = async (filePath) => {
        let existing = tabs.find((t) => t.filePath === filePath);
        if (existing) {
            await switchToTab(existing.id);
            return;
        }

        let tab = { id: filePath, filePath: filePath, label: getFilename(filePath) };
        tabs.push(tab);
        saveTabList();
        await switchToTab(tab.id);
    };

    let openScratchTab = (initialContent = '') => {
        let tab = {
            id: crypto.randomUUID(),
            filePath: null,
            label: nextScratchLabel()
        };
        tabs.push(tab);
        saveScratchContent(tab.id, initialContent);
        saveTabList();
        switchToTab(tab.id);
    };

    let closeTab = async (tabId) => {
        let idx = tabs.findIndex((t) => t.id === tabId);
        if (idx === -1) return;
        let tab = tabs[idx];

        // check dirty state for file tabs
        if (dirtyTabs.has(tabId) && tab.filePath) {
            let choice = await customSaveConfirm('Save changes to ' + tab.label + '?');
            if (choice === 'cancel') return;
            if (choice === 'save') {
                try {
                    await writeFileContent(tab.filePath, editor.getValue());
                } catch (err) {
                    await customAlert('Failed to save file: ' + err.message);
                    return;
                }
            }
            dirtyTabs.delete(tabId);
        }

        // check scratch tabs with content
        if (!tab.filePath && scratchHasContent(tabId)) {
            let choice = await customSaveConfirm('Save content of ' + tab.label + '?');
            if (choice === 'cancel') return;
            if (choice === 'save') {
                let success = await saveTab(tabId);
                if (!success) return; // Abort closing if save failed or was cancelled
            }
        }

        if (!tab.filePath) {
            removeScratchContent(tab.id);
            removeQuotes(tab.id);
        }
        removeTabScroll(tab.id);

        tabs.splice(idx, 1);

        if (tabs.length === 0) {
            openScratchTab();
            return;
        }

        if (activeTabId === tabId) {
            let nextIdx = Math.min(idx, tabs.length - 1);
            await switchToTab(tabs[nextIdx].id);
        } else {
            saveTabList();
            renderTabs();
        }
    };

    // ----- preview CSS loader (switch github-markdown css) -----
    const PREVIEW_CSS_LIGHT = 'css/github-markdown-light.css?v=1.11.0';
    const PREVIEW_CSS_DARK = 'css/github-markdown-dark_dimmed.css?v=1.11.0';

    let setPreviewCss = (useDark) => {
        const link = document.getElementById('gh-markdown-link');
        if (!link) {
            // fallback: create link element
            const newLink = document.createElement('link');
            newLink.id = 'gh-markdown-link';
            newLink.rel = 'stylesheet';
            newLink.href = useDark ? PREVIEW_CSS_DARK : PREVIEW_CSS_LIGHT;
            document.head.appendChild(newLink);
            return;
        }

        // Only update if href differs to avoid unnecessary reload
        const desired = useDark ? PREVIEW_CSS_DARK : PREVIEW_CSS_LIGHT;
        if (link.getAttribute('href') !== desired) {
            link.setAttribute('href', desired);
        }
    };

    // ----- highlight.js CSS loader -----
    const HLJS_CSS_LIGHT = 'css/hljs-github-light.css?v=1.11.0';
    const HLJS_CSS_DARK = 'css/hljs-github-dark.css?v=1.11.0';

    let setHljsCss = (useDark) => {
        const link = document.getElementById('hljs-theme-link');
        if (!link) {
            const newLink = document.createElement('link');
            newLink.id = 'hljs-theme-link';
            newLink.rel = 'stylesheet';
            newLink.href = useDark ? HLJS_CSS_DARK : HLJS_CSS_LIGHT;
            document.head.appendChild(newLink);
            return;
        }
        const desired = useDark ? HLJS_CSS_DARK : HLJS_CSS_LIGHT;
        if (link.getAttribute('href') !== desired) {
            link.setAttribute('href', desired);
        }
    };

    // ----- full width toggle -----
    let setFullWidth = (enabled) => {
        let container = document.querySelector('#container');
        if (container) {
            container.classList.toggle('full-width', enabled);
        }
    };

    let initFullWidthToggle = (settings) => {
        let checkbox = document.querySelector('#full-width-checkbox');
        if (!checkbox) return;
        checkbox.checked = settings;
        setFullWidth(settings);

        checkbox.addEventListener('change', (event) => {
            let checked = event.currentTarget.checked;
            setFullWidth(checked);
            saveFullWidthSettings(checked);
        });
    };

    // ----- preview max width setting -----
    let setPreviewMaxWidth = (ch) => {
        document.documentElement.style.setProperty('--fullscreen-preview-max-width', ch + 'ch');
    };

    let initFullscreenMaxWidthSetting = (savedValue) => {
        let input = document.querySelector('#preview-max-width-input');
        if (!input) return;
        let val = parseInt(savedValue, 10);
        if (isNaN(val) || val < CONFIG.fullscreenPreviewMaxWidthMin || val > CONFIG.fullscreenPreviewMaxWidthMax) {
            val = CONFIG.fullscreenPreviewMaxWidth;
        }
        input.value = val;
        setPreviewMaxWidth(val);

        let updateVal = () => {
            let current = parseInt(input.value, 10);
            if (isNaN(current)) {
                current = CONFIG.fullscreenPreviewMaxWidth;
            } else {
                if (current < CONFIG.fullscreenPreviewMaxWidthMin) current = CONFIG.fullscreenPreviewMaxWidthMin;
                if (current > CONFIG.fullscreenPreviewMaxWidthMax) current = CONFIG.fullscreenPreviewMaxWidthMax;
            }
            input.value = current;
            setPreviewMaxWidth(current);
            saveFullscreenMaxWidthSettings(current);
        };

        input.addEventListener('input', () => {
            let current = parseInt(input.value, 10);
            if (!isNaN(current) && current >= CONFIG.fullscreenPreviewMaxWidthMin && current <= CONFIG.fullscreenPreviewMaxWidthMax) {
                setPreviewMaxWidth(current);
                saveFullscreenMaxWidthSettings(current);
            }
        });

        input.addEventListener('change', updateVal);
    };

    // ----- theme toggle (dark/light) -----
    let setTheme = (enabled) => {
        document.documentElement.setAttribute('data-theme', enabled ? 'dark' : 'light');
    };

    let initThemeToggle = (settings) => {
        let checkbox = document.querySelector('#theme-checkbox');
        if (!checkbox) return;
        checkbox.checked = settings;
        setTheme(settings);

        // set Monaco editor theme to match page theme
        if (monaco && monaco.editor && typeof monaco.editor.setTheme === 'function') {
            monaco.editor.setTheme(settings ? 'vs-dark' : 'vs');
        }
        // set preview css to match theme
        setPreviewCss(settings);
        setHljsCss(settings);
        initializeMermaid(settings);

        checkbox.addEventListener('change', (event) => {
            let checked = event.currentTarget.checked;
            setTheme(checked);
            saveThemeSettings(checked);
            setPreviewCss(checked);
            setHljsCss(checked);
            initializeMermaid(checked);
            renderMermaidDiagrams(document.querySelector('#output'));
            if (monaco && monaco.editor && typeof monaco.editor.setTheme === 'function') {
                monaco.editor.setTheme(checked ? 'vs-dark' : 'vs');
            }
        });
    };

    // ----- quotation mode -----
    //
    // A quote is stored as text rather than as a DOM reference, because convert() rebuilds the
    // whole preview on every keystroke. Each render re-finds the text and re-applies the marks.

    let quoteModeEnabled = false;
    // quote id -> start offset in the flattened preview text, from the last highlight pass.
    // Doubles as the sort key, so the list and the clipboard follow document order.
    let quoteOffsets = new Map();
    let pendingSelection = null;
    let selectionCheckQueued = false;

    let loadQuotes = (tabId) => {
        if (!tabId) return [];
        let data = readJSON(STORAGE.tabQuotes(tabId));
        return Array.isArray(data) ? data : [];
    };

    let saveQuotes = (tabId, quotes) => {
        try {
            if (quotes.length === 0) {
                localStorage.removeItem(STORAGE.tabQuotes(tabId));
            } else {
                writeJSON(STORAGE.tabQuotes(tabId), quotes);
            }
            return true;
        } catch (err) {
            customAlert('Failed to save quotation: ' + err.message);
            return false;
        }
    };

    let removeQuotes = (tabId) => {
        localStorage.removeItem(STORAGE.tabQuotes(tabId));
    };

    // Follows a tab whose id changes (scratch saved to a file, or a path normalised by the server).
    // An existing set under the target id wins, so reopening a file never clobbers its own quotes.
    let migrateQuotes = (fromId, toId) => {
        if (!fromId || !toId || fromId === toId) return;
        let raw = localStorage.getItem(STORAGE.tabQuotes(fromId));
        if (raw == null) return;
        if (localStorage.getItem(STORAGE.tabQuotes(toId)) == null) {
            localStorage.setItem(STORAGE.tabQuotes(toId), raw);
        }
        localStorage.removeItem(STORAGE.tabQuotes(fromId));
    };

    let isInsideExcludedSubtree = (node) => {
        let el = (node && node.nodeType === Node.ELEMENT_NODE) ? node : (node ? node.parentElement : null);
        for (; el; el = el.parentElement) {
            let tag = el.tagName ? el.tagName.toLowerCase() : '';
            if (tag === 'svg' || tag === 'script' || tag === 'style') return true;
            if (el.classList && (el.classList.contains('mermaid') || el.classList.contains('katex-mathml'))) {
                return true;
            }
        }
        return false;
    };

    // Flatten the preview's text nodes into one string, keeping each node's span so a character
    // offset can be mapped back to a (node, offset) pair.
    let buildTextIndex = (root) => {
        let nodes = [];
        let text = '';
        let walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
                return isInsideExcludedSubtree(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
            }
        });
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            nodes.push({ node: node, start: text.length, end: text.length + node.nodeValue.length });
            text += node.nodeValue;
        }
        return { text: text, nodes: nodes };
    };

    // selection.toString() collapses rendered whitespace and inserts newlines at block boundaries,
    // so it never matches the raw DOM text literally. Both sides go through this, and map[] carries
    // each normalised character back to its raw index.
    let normaliseText = (raw) => {
        let text = '';
        let map = [];
        let pendingSpace = false;
        for (let i = 0; i < raw.length; i++) {
            let ch = raw[i];
            if (/[\s\u00a0]/.test(ch)) {
                if (text.length > 0) pendingSpace = true;
                continue;
            }
            if (pendingSpace) {
                text += ' ';
                map.push(i);
                pendingSpace = false;
            }
            text += ch;
            map.push(i);
        }
        return { text: text, map: map };
    };

    let findNthOccurrence = (haystack, needle, n) => {
        let at = -1;
        let from = 0;
        for (let i = 0; i <= n; i++) {
            at = haystack.indexOf(needle, from);
            if (at === -1) break;
            from = at + 1;
        }
        return at;
    };

    let rawOffsetOf = (index, container, offset) => {
        if (!container) return null;
        if (container.nodeType === Node.TEXT_NODE) {
            let entry = index.nodes.find((e) => e.node === container);
            return entry ? entry.start + offset : null;
        }
        // an element container's offset is a child index, so use the first indexed text node in it
        let child = container.childNodes[offset];
        if (!child) return null;
        let entry = index.nodes.find((e) => e.node === child || child.contains(e.node));
        return entry ? entry.start : null;
    };

    // Which copy of a repeated phrase this selection is, so the mark re-anchors to the right one.
    let selectionOccurrence = (range, selectedText) => {
        let output = document.querySelector('#output');
        if (!output) return 0;
        let index = buildTextIndex(output);
        let haystack = normaliseText(index.text);
        let needle = normaliseText(selectedText);
        if (!needle.text) return 0;

        let rawStart = rawOffsetOf(index, range.startContainer, range.startOffset);
        if (rawStart == null) return 0;
        let normStart = haystack.map.findIndex((rawIndex) => rawIndex >= rawStart);
        if (normStart === -1) return 0;

        let count = 0;
        let from = 0;
        for (;;) {
            let at = haystack.text.indexOf(needle.text, from);
            if (at === -1 || at >= normStart) break;
            count++;
            from = at + 1;
        }
        return count;
    };

    let mergeIntervals = (intervals) => {
        let merged = [];
        intervals.slice().sort((a, b) => a.start - b.start).forEach((interval) => {
            let last = merged[merged.length - 1];
            if (last && interval.start <= last.end) {
                last.end = Math.max(last.end, interval.end);
            } else {
                merged.push({ start: interval.start, end: interval.end });
            }
        });
        return merged;
    };

    // Applied back to front so splitting a text node never invalidates an earlier interval's
    // offsets: every remaining interval lies in the retained prefix of whatever was split.
    let wrapIntervals = (index, intervals) => {
        for (let i = intervals.length - 1; i >= 0; i--) {
            let interval = intervals[i];
            for (let j = index.nodes.length - 1; j >= 0; j--) {
                let entry = index.nodes[j];
                let from = Math.max(interval.start, entry.start);
                let to = Math.min(interval.end, entry.end);
                if (to <= from) continue;

                let node = entry.node;
                let localEnd = to - entry.start;
                let localStart = from - entry.start;
                // a range spanning blocks also covers the whitespace between them; marking that
                // would leave a stray underline with nothing under it
                if (!/\S/.test(node.nodeValue.slice(localStart, localEnd))) continue;
                if (localEnd < node.nodeValue.length) node.splitText(localEnd);
                let covered = localStart > 0 ? node.splitText(localStart) : node;

                let parent = covered.parentNode;
                if (!parent) continue;
                let mark = document.createElement('mark');
                mark.className = 'mlp-quote';
                parent.replaceChild(mark, covered);
                mark.appendChild(covered);
            }
        }
    };

    let clearQuoteHighlights = (root) => {
        let marks = root.querySelectorAll('mark.mlp-quote');
        marks.forEach((mark) => {
            let parent = mark.parentNode;
            if (!parent) return;
            while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
            parent.removeChild(mark);
        });
        if (marks.length > 0) root.normalize();
    };

    // Resolve every quote of the active tab to a range in the flattened preview text, record the
    // start offsets for ordering, then wrap the merged ranges in <mark>.
    let applyQuoteHighlights = (root) => {
        quoteOffsets = new Map();
        if (!root || !quoteModeEnabled) return;

        let quotes = loadQuotes(activeTabId);
        if (quotes.length === 0) return;

        let index = buildTextIndex(root);
        if (!index.text) return;
        let haystack = normaliseText(index.text);

        let intervals = [];
        quotes.forEach((quote) => {
            let needle = normaliseText(String(quote.text || ''));
            if (!needle.text) return;
            let at = findNthOccurrence(haystack.text, needle.text, quote.occurrence || 0);
            if (at === -1) at = haystack.text.indexOf(needle.text);
            if (at === -1) return;

            let start = haystack.map[at];
            let end = haystack.map[at + needle.text.length - 1] + 1;
            quoteOffsets.set(quote.id, start);
            intervals.push({ start: start, end: end });
        });

        wrapIntervals(index, mergeIntervals(intervals));
    };

    let refreshQuoteHighlights = () => {
        let output = document.querySelector('#output');
        if (!output) return;
        clearQuoteHighlights(output);
        applyQuoteHighlights(output);
    };

    // ----- quotation: selection button -----

    let hideSelectionButton = () => {
        pendingSelection = null;
        let button = document.querySelector('#quote-selection-button');
        if (button) button.hidden = true;
    };

    let previewSelection = () => {
        let output = document.querySelector('#output');
        let selection = window.getSelection();
        if (!output || !selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
        if (!selection.toString().trim()) return null;
        if (!output.contains(selection.anchorNode) || !output.contains(selection.focusNode)) return null;

        let range = selection.getRangeAt(0);
        if (isInsideExcludedSubtree(range.commonAncestorContainer)) return null;
        return { text: selection.toString(), range: range.cloneRange() };
    };

    let positionSelectionButton = () => {
        let button = document.querySelector('#quote-selection-button');
        let previewElement = document.querySelector('#preview');
        if (!button || !previewElement || !pendingSelection) return;

        let rect = pendingSelection.range.getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) {
            hideSelectionButton();
            return;
        }

        let pane = previewElement.getBoundingClientRect();
        if (rect.bottom < pane.top || rect.top > pane.bottom) {
            button.hidden = true;
            return;
        }

        button.hidden = false;
        let width = button.offsetWidth;
        let height = button.offsetHeight;
        let left = Math.min(Math.max(rect.right - width, pane.left + 4), pane.right - width - 4);
        let top = Math.max(rect.top - height - 4, pane.top + 4);
        button.style.left = left + 'px';
        button.style.top = top + 'px';
    };

    let scheduleSelectionCheck = () => {
        if (selectionCheckQueued) return;
        selectionCheckQueued = true;
        requestAnimationFrame(() => {
            selectionCheckQueued = false;
            if (!quoteModeEnabled) {
                hideSelectionButton();
                return;
            }
            let found = previewSelection();
            if (!found) {
                hideSelectionButton();
                return;
            }
            pendingSelection = found;
            positionSelectionButton();
        });
    };

    // ----- quotation: dialogs -----

    const promptQuoteNote = (selectedText) => {
        return new Promise((resolve) => {
            const dialog = document.createElement('dialog');
            dialog.className = 'custom-dialog quote-dialog';
            dialog.innerHTML = `
                <div class="dialog-container">
                    <h3 class="quote-dialog-title">Add quotation</h3>
                    <blockquote class="quote-dialog-selection">${escapeHtml(selectedText)}</blockquote>
                    <div class="dialog-input-container">
                        <textarea id="quote-note-input" class="dialog-input quote-note-input" rows="5" placeholder="Add a note"></textarea>
                    </div>
                    <div class="dialog-actions">
                        <button id="cancel" class="dialog-button dialog-button-default">Cancel</button>
                        <button id="save" class="dialog-button dialog-button-primary">Save</button>
                    </div>
                </div>
            `;
            document.body.appendChild(dialog);
            dialog.showModal();

            const input = dialog.querySelector('#quote-note-input');
            input.focus();

            const onCancel = () => { resolve(null); dialog.close(); dialog.remove(); };

            // a quotation without a note is pointless, so Save stays inert until there is one
            dialog.querySelector('#save').onclick = () => {
                const note = input.value.trim();
                if (!note) return;
                resolve(note);
                dialog.close();
                dialog.remove();
            };
            dialog.querySelector('#cancel').onclick = onCancel;
            dialog.onclose = onCancel;
        });
    };

    let addQuoteFromSelection = async (captured) => {
        let tabId = activeTabId;
        if (!tabId) return;

        // resolved before the dialog opens, while the range is still known to be live
        let occurrence = selectionOccurrence(captured.range, captured.text);
        let note = await promptQuoteNote(captured.text);
        if (note === null) return;

        let quotes = loadQuotes(tabId);
        quotes.push({ id: crypto.randomUUID(), text: captured.text, note: note, occurrence: occurrence });
        if (!saveQuotes(tabId, quotes)) return;

        let selection = window.getSelection();
        if (selection) selection.removeAllRanges();
        refreshQuoteHighlights();
        refreshQuotesButton();
    };

    // a quote nested inside another starts at the same character, so the wider one comes first.
    // Quotes that could not be located in the current document have no offset and sort last.
    let sortQuotes = (quotes) => {
        return quotes.slice().sort((a, b) => {
            let aAt = quoteOffsets.has(a.id) ? quoteOffsets.get(a.id) : Infinity;
            let bAt = quoteOffsets.has(b.id) ? quoteOffsets.get(b.id) : Infinity;
            if (aAt !== bAt) return aAt - bAt;
            return String(b.text || '').length - String(a.text || '').length;
        });
    };

    const BIN_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

    let removeQuote = (quoteId) => {
        let tabId = activeTabId;
        let quotes = loadQuotes(tabId).filter((q) => q.id !== quoteId);
        if (!saveQuotes(tabId, quotes)) return;

        refreshQuoteHighlights();
        refreshQuotesButton();

        let dialog = document.querySelector('#quotes-dialog');
        if (quotes.length === 0) {
            if (dialog && dialog.open) dialog.close();
            return;
        }
        renderQuotesList();
    };

    let renderQuotesList = () => {
        let body = document.querySelector('#quotes-dialog-body');
        let count = document.querySelector('#quotes-dialog-count');
        if (!body) return;

        let quotes = sortQuotes(loadQuotes(activeTabId));
        if (count) count.textContent = String(quotes.length);
        body.innerHTML = '';

        quotes.forEach((quote) => {
            let located = quoteOffsets.has(quote.id);
            let item = document.createElement('div');
            item.className = 'quote-item' + (located ? '' : ' quote-item-orphan');

            let text = document.createElement('blockquote');
            text.className = 'quote-item-text';
            text.textContent = quote.text;
            item.appendChild(text);

            if (!located) {
                let hint = document.createElement('div');
                hint.className = 'quote-item-hint';
                hint.textContent = 'Not found in the current document';
                item.appendChild(hint);
            }

            let note = document.createElement('div');
            note.className = 'quote-item-note';
            note.textContent = quote.note;
            item.appendChild(note);

            let remove = document.createElement('button');
            remove.className = 'quote-item-remove';
            remove.type = 'button';
            remove.title = 'Remove quotation';
            remove.innerHTML = BIN_ICON;
            remove.addEventListener('click', () => removeQuote(quote.id));
            item.appendChild(remove);

            body.appendChild(item);
        });
    };

    // blank lines around the selection go, but the first line keeps its indentation, which
    // matters when the quote came out of a code block
    let formatQuotesForClipboard = (quotes) => {
        return quotes.map((quote) => {
            let quoted = String(quote.text).replace(/^[\r\n]+/, '').replace(/\s+$/, '').split('\n')
                .map((line) => (line.trim() === '' ? '>' : '> ' + line))
                .join('\n');
            return quoted + '\n' + quote.note;
        }).join('\n\n');
    };

    let refreshQuotesButton = () => {
        let button = document.querySelector('#quotes-open-button');
        if (!button) return;
        let quotes = quoteModeEnabled ? loadQuotes(activeTabId) : [];
        let badge = button.querySelector('.quotes-badge');
        if (badge) badge.textContent = String(quotes.length);
        button.hidden = quotes.length === 0;
    };

    let setupQuotationMode = () => {
        let selectionButton = document.querySelector('#quote-selection-button');
        let openButton = document.querySelector('#quotes-open-button');
        let dialog = document.querySelector('#quotes-dialog');
        let copyButton = document.querySelector('#quotes-copy-button');
        let previewElement = document.querySelector('#preview');

        document.addEventListener('selectionchange', scheduleSelectionCheck);
        if (previewElement) previewElement.addEventListener('scroll', positionSelectionButton);
        window.addEventListener('resize', positionSelectionButton);

        if (selectionButton) {
            // keep the selection alive: a plain mousedown on the button would collapse it
            selectionButton.addEventListener('mousedown', (event) => event.preventDefault());
            selectionButton.addEventListener('click', (event) => {
                event.preventDefault();
                let captured = pendingSelection;
                if (!captured) return;
                hideSelectionButton();
                addQuoteFromSelection(captured);
            });
        }

        if (openButton && dialog) {
            openButton.addEventListener('click', (event) => {
                event.preventDefault();
                renderQuotesList();
                dialog.showModal();
            });

            // close on clicking the backdrop rather than the dialog itself
            dialog.addEventListener('click', (event) => {
                const rect = dialog.getBoundingClientRect();
                const isInDialog = (
                    rect.top <= event.clientY && event.clientY <= rect.top + rect.height &&
                    rect.left <= event.clientX && event.clientX <= rect.left + rect.width
                );
                if (!isInDialog) dialog.close();
            });
        }

        if (copyButton) {
            copyButton.addEventListener('click', async () => {
                let quotes = sortQuotes(loadQuotes(activeTabId));
                if (quotes.length === 0) return;
                try {
                    await navigator.clipboard.writeText(formatQuotesForClipboard(quotes));
                    copyButton.textContent = 'Copied';
                    setTimeout(() => { copyButton.textContent = 'Copy all'; }, 1200);
                } catch (err) {
                    await customAlert('Could not copy to clipboard: ' + err.message);
                }
            });
        }
    };

    let initQuoteModeToggle = (settings) => {
        quoteModeEnabled = settings;
        refreshQuoteHighlights();
        refreshQuotesButton();

        let checkbox = document.querySelector('#quote-mode-checkbox');
        if (!checkbox) return;
        checkbox.checked = settings;

        // toggling only changes what is shown; no stored quotation is touched either way
        checkbox.addEventListener('change', (event) => {
            quoteModeEnabled = event.currentTarget.checked;
            saveQuoteModeSettings(quoteModeEnabled);
            if (!quoteModeEnabled) {
                hideSelectionButton();
                let dialog = document.querySelector('#quotes-dialog');
                if (dialog && dialog.open) dialog.close();
            }
            refreshQuoteHighlights();
            refreshQuotesButton();
        });
    };

    // ----- setup -----

    // Refresh file content (re-read from disk)
    let refreshFile = async () => {
        let current = getActiveTab();
        if (!current || !current.filePath) return;

        if (dirtyTabs.has(current.id)) {
            let choice = await customSaveConfirm('Save changes to ' + current.label + ' before refreshing?');
            if (choice === 'cancel') return;
            if (choice === 'save') {
                try {
                    await writeFileContent(current.filePath, editor.getValue());
                } catch (err) {
                    await customAlert('Failed to save file: ' + err.message);
                    return;
                }
            }
            dirtyTabs.delete(current.id);
        }

        let previewEl = document.querySelector('#preview');
        let savedScroll = previewEl ? previewEl.scrollTop : null;
        if (savedScroll != null) saveTabScroll(current.id, savedScroll);

        presetValue('');
        await new Promise((resolve) => setTimeout(resolve, 100));
        try {
            let result = await fetchFileContent(current.filePath);
            presetValue(result.content);
            if (savedScroll != null) {
                requestAnimationFrame(() => {
                    let el = document.querySelector('#preview');
                    if (el) el.scrollTop = savedScroll;
                });
            }
        } catch (err) {
            await customAlert('Failed to refresh file: ' + err.message);
        }
    };

    // setup navigation actions
    let setupRefreshButton = () => {
        document.querySelector("#refresh-button").addEventListener('click', (event) => {
            event.preventDefault();
            refreshFile();
        });
    };

    let setupSaveButton = () => {
        document.querySelector("#save-button").addEventListener('click', (event) => {
            event.preventDefault();
            if (activeTabId) saveTab(activeTabId);
        });
    };

    // returns null when the read failed or was cancelled, '' for an empty clipboard
    let readClipboardText = async ({ offerRetry }) => {
        try {
            return await navigator.clipboard.readText();
        } catch (err) {
            // a read with no user gesture behind it (the #[clipboard] hash) can be
            // rejected; a click on the dialog supplies the missing activation
            if (offerRetry) {
                let retry = await customConfirm(
                    'Could not read clipboard automatically. Click Paste to try again.',
                    'Paste'
                );
                if (!retry) return null;
                return await readClipboardText({ offerRetry: false });
            }
            await customAlert('Could not read clipboard: ' + err.message);
            return null;
        }
    };

    let openTabFromClipboard = async ({ offerRetry = false } = {}) => {
        let text = await readClipboardText({ offerRetry });
        if (text === null) return;
        if (!text) {
            await customAlert('Clipboard is empty.');
            return;
        }
        openScratchTab(text);
    };

    let setupClipboardButton = () => {
        document.querySelector("#clipboard-button").addEventListener('click', (event) => {
            event.preventDefault();
            openTabFromClipboard();
        });
    };

    // navigating an already-open tab to #[clipboard] only changes the fragment,
    // so the load-time check alone would not fire
    let setupClipboardHashTrigger = () => {
        window.addEventListener('hashchange', () => {
            if (!isClipboardHash(window.location.hash)) return;
            openTabFromClipboard({ offerRetry: true });
        });
    };

    let setupSettingsButton = () => {
        const button = document.querySelector('#settings-button');
        const dialog = document.querySelector('#settings-dialog');
        if (!button || !dialog) return;

        button.addEventListener('click', (event) => {
            event.preventDefault();
            dialog.showModal();
        });

        // Close on clicking outside dialog content (the backdrop)
        dialog.addEventListener('click', (event) => {
            const rect = dialog.getBoundingClientRect();
            const isInDialog = (
                rect.top <= event.clientY && event.clientY <= rect.top + rect.height &&
                rect.left <= event.clientX && event.clientX <= rect.left + rect.width
            );
            if (!isInDialog) {
                dialog.close();
            }
        });
    };

    let loadFileFromPath = async (filePath) => {
        await openFileTab(filePath);
    };

    let setupFilePathInput = () => {
        const input = document.querySelector('#file-path-input');
        if (!input) return;
        // clicking the unfocused input selects the whole path; once focused, clicks
        // place the cursor as usual so part of the path can still be edited
        input.addEventListener('mousedown', (event) => {
            if (document.activeElement === input) return;
            event.preventDefault();
            input.focus();
            input.select();
        });
        input.addEventListener('keydown', async (event) => {
            if (event.key !== 'Enter') return;
            const filePath = input.value.trim();
            if (!filePath) return;
            loadFileFromPath(filePath);
        });
    };

    // ----- local state -----

    let loadFullWidthSettings = () => {
        return localStorage.getItem(STORAGE.fullWidth) === 'true';
    };

    let saveFullWidthSettings = (enabled) => {
        localStorage.setItem(STORAGE.fullWidth, String(enabled));
    };

    let loadFullscreenMaxWidthSettings = () => {
        let saved = localStorage.getItem(STORAGE.fullscreenPreviewMaxWidth);
        if (!saved) return CONFIG.fullscreenPreviewMaxWidth;
        let parsed = parseInt(saved, 10);
        return isNaN(parsed) ? CONFIG.fullscreenPreviewMaxWidth : parsed;
    };

    let saveFullscreenMaxWidthSettings = (value) => {
        localStorage.setItem(STORAGE.fullscreenPreviewMaxWidth, String(value));
    };

    let loadQuoteModeSettings = () => {
        return localStorage.getItem(STORAGE.quoteMode) === 'true';
    };

    let saveQuoteModeSettings = (enabled) => {
        localStorage.setItem(STORAGE.quoteMode, String(enabled));
    };

    let loadThemeSettings = () => {
        return localStorage.getItem(STORAGE.theme) === 'dark';
    };

    let saveThemeSettings = (enabled) => {
        localStorage.setItem(STORAGE.theme, enabled ? 'dark' : 'light');
    };

    let loadDividerRatio = () => {
        return localStorage.getItem(STORAGE.dividerRatio);
    };

    let saveDividerRatio = (ratio) => {
        localStorage.setItem(STORAGE.dividerRatio, String(ratio));
    };

    let setupDivider = () => {
        const savedRatio = parseFloat(loadDividerRatio());
        let lastLeftRatio = (savedRatio && savedRatio > 0 && savedRatio < 1) ? savedRatio : 0.5;
        const divider = document.getElementById('split-divider');
        const leftPane = document.getElementById('edit');
        const rightPane = document.getElementById('preview');
        const container = document.getElementById('container');

        // apply saved ratio
        if (savedRatio && savedRatio > 0 && savedRatio < 1) {
            const containerRect = container.getBoundingClientRect();
            const totalWidth = containerRect.width;
            const dividerWidth = divider.offsetWidth;
            const availableWidth = totalWidth - dividerWidth;
            leftPane.style.width = (availableWidth * lastLeftRatio) + 'px';
            rightPane.style.width = (availableWidth * (1 - lastLeftRatio)) + 'px';
        }

        let isDragging = false;

        divider.addEventListener('mouseenter', () => {
            divider.classList.add('hover');
        });

        divider.addEventListener('mouseleave', () => {
            if (!isDragging) {
                divider.classList.remove('hover');
            }
        });

        divider.addEventListener('mousedown', () => {
            isDragging = true;
            divider.classList.add('active');
            document.body.style.cursor = 'col-resize';
        });

        divider.addEventListener('dblclick', () => {
            const containerRect = container.getBoundingClientRect();
            const totalWidth = containerRect.width;
            const dividerWidth = divider.offsetWidth;
            const halfWidth = (totalWidth - dividerWidth) / 2;

            leftPane.style.width = halfWidth + 'px';
            rightPane.style.width = halfWidth + 'px';
            lastLeftRatio = 0.5;
            saveDividerRatio(lastLeftRatio);
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            document.body.style.userSelect = 'none';
            const containerRect = container.getBoundingClientRect();
            const totalWidth = containerRect.width;
            const offsetX = e.clientX - containerRect.left;
            const dividerWidth = divider.offsetWidth;

            // Prevent overlap or out-of-bounds
            const minWidth = 100;
            const maxWidth = totalWidth - minWidth - dividerWidth;
            const leftWidth = Math.max(minWidth, Math.min(offsetX, maxWidth));
            leftPane.style.width = leftWidth + 'px';
            rightPane.style.width = (totalWidth - leftWidth - dividerWidth) + 'px';
            lastLeftRatio = leftWidth / (totalWidth - dividerWidth);
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                divider.classList.remove('active');
                divider.classList.remove('hover');
                document.body.style.cursor = 'default';
                document.body.style.userSelect = '';
                saveDividerRatio(lastLeftRatio);
            }
        });

        window.addEventListener('resize', () => {
            const containerRect = container.getBoundingClientRect();
            const totalWidth = containerRect.width;
            const dividerWidth = divider.offsetWidth;
            const availableWidth = totalWidth - dividerWidth;

            const newLeft = availableWidth * lastLeftRatio;
            const newRight = availableWidth * (1 - lastLeftRatio);

            leftPane.style.width = newLeft + 'px';
            rightPane.style.width = newRight + 'px';
        });
    };

    // ----- entry point -----
    let editor = setupEditor();

    // restore tabs from localStorage
    let { tabs: persistedTabs, activeId: persistedActiveId } = loadTabList();

    if (persistedTabs.length > 0) {
        tabs = persistedTabs.map((t) => ({ id: t.id, filePath: t.filePath, label: t.label }));
    }

    cleanupOrphanScratchContent();

    let clipboardRequested = isClipboardHash(window.location.hash);
    let hashPath = clipboardRequested ? '' : decodeHash(window.location.hash);

    // set initial content before async tab switching
    presetValue(defaultInput);

    setupRefreshButton();
    setupSaveButton();
    setupClipboardButton();
    setupClipboardHashTrigger();
    setupSettingsButton();
    setupFilePathInput();
    setupQuotationMode();

    // initialise tabs
    let initialTabReady;
    if (hashPath) {
        initialTabReady = openFileTab(hashPath);
    } else if (tabs.length > 0) {
        let startId = (persistedActiveId && tabs.find((t) => t.id === persistedActiveId))
            ? persistedActiveId
            : tabs[0].id;
        initialTabReady = switchToTab(startId);
    } else {
        let tab = { id: crypto.randomUUID(), filePath: null, label: nextScratchLabel() };
        tabs.push(tab);
        saveScratchContent(tab.id, defaultInput);
        activeTabId = tab.id;
        presetValue(defaultInput);
        saveTabList();
        renderTabs();
        initialTabReady = Promise.resolve();
    }

    // the clipboard tab is opened on top of the restored tabs, so it has to wait for
    // the initial tab switch to finish before it takes over the active tab and content
    if (clipboardRequested) {
        initialTabReady.then(() => openTabFromClipboard({ offerRetry: true }));
    }

    initFullscreenMaxWidthSetting(loadFullscreenMaxWidthSettings());
    initFullWidthToggle(loadFullWidthSettings());
    initThemeToggle(loadThemeSettings());
    initQuoteModeToggle(loadQuoteModeSettings());

    setupDivider();

    if (loadEditorCollapsed()) {
        let container = document.querySelector('#container');
        if (container) container.classList.add('editor-collapsed');
    }

    window.addEventListener('beforeunload', (e) => {
        if (dirtyTabs.size > 0) {
            e.preventDefault();
        }
    });
};

window.addEventListener("load", () => {
    init();
});
