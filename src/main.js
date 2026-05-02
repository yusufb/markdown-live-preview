import Storehouse from 'storehouse-js';
import * as monaco from 'monaco-editor';
import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';
import html2pdf from 'html2pdf.js';
import mermaid from 'mermaid';

// ----- config -----
const CONFIG = {
    showExportPdf: false,
    scratchSaveDir: '~/Downloads',
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

        dialog.querySelector('#confirm').onclick = () => { resolve(true); dialog.close(); dialog.remove(); };
        dialog.querySelector('#cancel').onclick = () => { resolve(false); dialog.close(); dialog.remove(); };
        dialog.onclose = () => { if (document.body.contains(dialog)) { resolve(false); dialog.remove(); } };
    });
};


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

const init = () => {
    let hasEdited = false;
    let scrollBarSync = false;

    const localStorageNamespace = 'com.markdownlivepreview';
    const localStorageKey = 'last_state';
    const localStorageScrollBarKey = 'scroll_bar_settings';
    const localStorageThemeKey = 'theme_settings';
    const localStorageDividerKey = 'divider_ratio';
    const localStorageTabsKey = 'tabs';
    const localStorageActiveTabKey = 'active_tab';

    // ----- tab state -----
    let tabs = [];
    let activeTabId = null;
    let dirtyTabs = new Set();
    let suppressDirty = false;
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
            if (!scrollBarSync || scrollSource === 'preview') {
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
            if (!scrollBarSync || scrollSource === 'editor') {
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
        let sanitized = DOMPurify.sanitize(html, { ADD_ATTR: ['class', 'data-mermaid'] });
        const output = document.querySelector('#output');
        output.innerHTML = sanitized;
        renderMermaidDiagrams(output);
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
        let expiredAt = new Date(2099, 1, 1);
        let persisted = tabs.map((t) => ({ id: t.id, filePath: t.filePath, label: t.label }));
        Storehouse.setItem(localStorageNamespace, localStorageTabsKey, JSON.stringify(persisted), expiredAt);
        Storehouse.setItem(localStorageNamespace, localStorageActiveTabKey, activeTabId, expiredAt);
    };

    let loadTabList = () => {
        let raw = Storehouse.getItem(localStorageNamespace, localStorageTabsKey);
        if (!raw) return [];
        try {
            return JSON.parse(raw);
        } catch (e) {
            return [];
        }
    };

    let loadScratchContent = (tabId) => {
        return Storehouse.getItem(localStorageNamespace, 'tab_content_' + tabId);
    };

    let saveScratchContent = (tabId, content) => {
        let expiredAt = new Date(2099, 1, 1);
        Storehouse.setItem(localStorageNamespace, 'tab_content_' + tabId, content, expiredAt);
    };

    let removeScratchContent = (tabId) => {
        Storehouse.deleteItem(localStorageNamespace, 'tab_content_' + tabId);
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

    let saveActiveTab = async () => {
        let current = getActiveTab();
        if (!current) return;

        if (current.filePath) {
            // file tab - write to disk
            try {
                await writeFileContent(current.filePath, editor.getValue());
                dirtyTabs.delete(current.id);
                renderTabs();
            } catch (err) {
                await customAlert('Failed to save file: ' + err.message);
            }
        } else {
            // scratch tab - download as .md file and convert to file tab
            let now = new Date();
            let pad = (n) => String(n).padStart(2, '0');
            let filename = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
                + '-' + pad(now.getHours()) + '-' + pad(now.getMinutes()) + '-' + pad(now.getSeconds()) + '.md';

            // trigger browser download
            let blob = new Blob([editor.getValue()], { type: 'text/markdown' });
            let url = URL.createObjectURL(blob);
            let a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);

            // save to disk and convert scratch to file tab
            let savePath = CONFIG.scratchSaveDir + '/' + filename;
            try {
                await writeFileContent(savePath, editor.getValue());
                let oldId = current.id;
                removeScratchContent(oldId);
                current.filePath = savePath;
                current.label = filename;
                current.id = savePath;
                activeTabId = savePath;
                window.location.hash = encodeURIComponent(savePath);
                let input = document.querySelector('#file-path-input');
                if (input) input.value = savePath;
                document.title = filename + ' - Markdown Live Preview';
                saveTabList();
                renderTabs();
            } catch (err) {
                await customAlert('Failed to save file to disk: ' + err.message);
            }
        }
    };

    let scratchHasContent = (tabId) => {
        let tab = tabs.find((t) => t.id === tabId);
        if (!tab || tab.filePath) return false;
        let content = loadScratchContent(tabId);
        return content !== null && content !== undefined && content.trim() !== '';
    };

    let hasUnsavedChanges = (tabId) => {
        if (dirtyTabs.has(tabId)) return true;
        return scratchHasContent(tabId);
    };

    // Returns true if it's ok to proceed, false if cancelled
    let confirmDirtyTab = async (tabId) => {
        let tab = tabs.find((t) => t.id === tabId);
        if (!tab) return true;

        if (tab.filePath && dirtyTabs.has(tabId)) {
            let save = await customConfirm('Save changes to ' + tab.label + '?', 'Save', 'Don\'t Save');
            if (save) {
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
        activeTabId = tabId;
        let tab = getActiveTab();
        if (!tab) return;

        if (tab.filePath) {
            try {
                let result = await fetchFileContent(tab.filePath);
                presetValue(result.content);
                // update tab if path was normalised by server
                if (result.resolvedPath !== tab.filePath) {
                    tab.filePath = result.resolvedPath;
                    tab.id = result.resolvedPath;
                    tab.label = getFilename(result.resolvedPath);
                    activeTabId = result.resolvedPath;
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

    let openScratchTab = () => {
        let tab = {
            id: crypto.randomUUID(),
            filePath: null,
            label: nextScratchLabel()
        };
        tabs.push(tab);
        saveScratchContent(tab.id, '');
        saveTabList();
        switchToTab(tab.id);
    };

    let closeTab = async (tabId) => {
        let idx = tabs.findIndex((t) => t.id === tabId);
        if (idx === -1) return;
        let tab = tabs[idx];

        // check dirty state for file tabs
        if (dirtyTabs.has(tabId) && tab.filePath) {
            let save = await customConfirm('Save changes to ' + tab.label + '?', 'Save', 'Don\'t Save');
            if (save) {
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
            let save = await customConfirm('Save content of ' + tab.label + '?', 'Save', 'Don\'t Save');
            if (save) {
                await saveActiveTab();
            }
        }

        // clean up scratch content
        if (!tab.filePath) {
            removeScratchContent(tab.id);
        }

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

    // ----- sync scroll position -----

    let initScrollBarSync = (settings) => {
        let checkbox = document.querySelector('#sync-scroll-checkbox');
        checkbox.checked = settings;
        scrollBarSync = settings;

        checkbox.addEventListener('change', (event) => {
            let checked = event.currentTarget.checked;
            scrollBarSync = checked;
            saveScrollBarSettings(checked);
        });
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

    let enableScrollBarSync = () => {
        scrollBarSync = true;
    };

    let disableScrollBarSync = () => {
        scrollBarSync = false;
    };

    // ----- clipboard utils -----

    let copyToClipboard = (text, successHandler, errorHandler) => {
        navigator.clipboard.writeText(text).then(
            () => {
                successHandler();
            },

            () => {
                errorHandler();
            }
        );
    };

    let notifyCopied = () => {
        let labelElement = document.querySelector("#copy-button a");
        labelElement.innerHTML = "Copied!";
        setTimeout(() => {
            labelElement.innerHTML = "Copy";
        }, 1000)
    };

    // ----- export preview -----

    let exportLightCssPromise = null;

    let getLightMarkdownCss = () => {
        if (exportLightCssPromise) {
            return exportLightCssPromise;
        }

        exportLightCssPromise = fetch(PREVIEW_CSS_LIGHT)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to load export CSS: ${response.status}`);
                }
                return response.text();
            })
            .catch((error) => {
                // eslint-disable-next-line no-console
                console.error('Failed to load light markdown CSS', error);
                return '';
            });

        return exportLightCssPromise;
    };

    let exportPreviewToPdf = () => {
        const previewElement = document.querySelector('#preview-wrapper');
        if (!previewElement) {
            return;
        }

        if (typeof html2pdf !== 'function') {
            customAlert('PDF export is not available yet. Please try again in a moment.');
            return;
        }

        getLightMarkdownCss().then((lightCss) => {
            const options = {
                margin: 10,
                filename: 'markdown-preview.pdf',
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    onclone: (clonedDoc) => {
                        clonedDoc.documentElement.setAttribute('data-theme', 'light');

                        const markdownLink = clonedDoc.getElementById('gh-markdown-link');
                        if (markdownLink) {
                            markdownLink.setAttribute('href', PREVIEW_CSS_LIGHT);
                        }

                        if (lightCss) {
                            const style = clonedDoc.createElement('style');
                            style.id = 'export-light-css';
                            style.textContent = `${lightCss}
#preview-wrapper, #output, body {
  background: #fff !important;
  color: #24292f !important;
}`;
                            clonedDoc.head.appendChild(style);
                        }

                        const clonedPreview = clonedDoc.getElementById('preview-wrapper');
                        if (clonedPreview) {
                            clonedPreview.style.background = '#fff';
                            clonedPreview.style.color = '#24292f';
                            clonedPreview.style.width = '190mm';
                            clonedPreview.style.maxWidth = '190mm';
                        }

                        const clonedOutput = clonedDoc.getElementById('output');
                        if (clonedOutput) {
                            clonedOutput.style.background = '#fff';
                            clonedOutput.style.color = '#24292f';
                            clonedOutput.style.width = '190mm';
                            clonedOutput.style.maxWidth = '190mm';
                        }
                    }
                },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            html2pdf()
                .set(options)
                .from(previewElement)
                .save()
                .catch((error) => {
                    // eslint-disable-next-line no-console
                    console.error('Failed to export PDF', error);
                });
        });
    };

    // ----- setup -----

    // Refresh file content (re-read from disk)
    let refreshFile = async () => {
        let current = getActiveTab();
        if (!current || !current.filePath) return;

        if (dirtyTabs.has(current.id)) {
            let save = await customConfirm('Save changes to ' + current.label + ' before refreshing?', 'Save', 'Don\'t Save');
            if (save) {
                try {
                    await writeFileContent(current.filePath, editor.getValue());
                } catch (err) {
                    await customAlert('Failed to save file: ' + err.message);
                    return;
                }
            }
            dirtyTabs.delete(current.id);
        }

        presetValue('');
        await new Promise((resolve) => setTimeout(resolve, 100));
        try {
            let result = await fetchFileContent(current.filePath);
            presetValue(result.content);
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

    let setupCopyButton = (editor) => {
        document.querySelector("#copy-button").addEventListener('click', (event) => {
            event.preventDefault();
            let value = editor.getValue();
            copyToClipboard(value, () => {
                notifyCopied();
            },
                () => {
                    // nothing to do
                });
        });
    };

    let setupSaveButton = () => {
        document.querySelector("#save-button").addEventListener('click', (event) => {
            event.preventDefault();
            saveActiveTab();
        });
    };

    let setupExportButton = () => {
        const exportButton = document.querySelector('#export-button');
        if (!exportButton) {
            return;
        }
        if (!CONFIG.showExportPdf) {
            exportButton.style.display = 'none';
            return;
        }
        exportButton.addEventListener('click', (event) => {
            event.preventDefault();
            exportPreviewToPdf();
        });
    };

    let loadFileFromPath = async (filePath) => {
        await openFileTab(filePath);
    };

    let setupFilePathInput = () => {
        const input = document.querySelector('#file-path-input');
        if (!input) return;
        input.addEventListener('keydown', async (event) => {
            if (event.key !== 'Enter') return;
            const filePath = input.value.trim();
            if (!filePath) return;
            loadFileFromPath(filePath);
        });
    };

    // ----- local state -----

    let loadLastContent = () => {
        let lastContent = Storehouse.getItem(localStorageNamespace, localStorageKey);
        return lastContent;
    };

    let saveLastContent = (content) => {
        let expiredAt = new Date(2099, 1, 1);
        Storehouse.setItem(localStorageNamespace, localStorageKey, content, expiredAt);
    };

    let loadScrollBarSettings = () => {
        let lastContent = Storehouse.getItem(localStorageNamespace, localStorageScrollBarKey);
        return lastContent;
    };

    let loadThemeSettings = () => {
        let last = Storehouse.getItem(localStorageNamespace, localStorageThemeKey);
        if (last === null || last === undefined) {
            try {
                // fallback to raw localStorage boot key used by inline script
                const raw = localStorage.getItem('com.markdownlivepreview_theme');
                if (raw === 'dark') return true;
                if (raw === 'light') return false;
            } catch (e) {
                // ignore
            }
        }
        return last;
    };

    let saveScrollBarSettings = (settings) => {
        let expiredAt = new Date(2099, 1, 1);
        Storehouse.setItem(localStorageNamespace, localStorageScrollBarKey, settings, expiredAt);
    };

    let saveThemeSettings = (settings) => {
        let expiredAt = new Date(2099, 1, 1);
        Storehouse.setItem(localStorageNamespace, localStorageThemeKey, settings, expiredAt);
        try {
            localStorage.setItem('com.markdownlivepreview_theme', settings ? 'dark' : 'light');
        } catch (e) {
            // ignore storage errors
        }
    };

    let loadDividerRatio = () => {
        return Storehouse.getItem(localStorageNamespace, localStorageDividerKey);
    };

    let saveDividerRatio = (ratio) => {
        let expiredAt = new Date(2099, 1, 1);
        Storehouse.setItem(localStorageNamespace, localStorageDividerKey, ratio, expiredAt);
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
    let persistedTabs = loadTabList();
    let persistedActiveId = Storehouse.getItem(localStorageNamespace, localStorageActiveTabKey);

    if (persistedTabs.length > 0) {
        tabs = persistedTabs.map((t) => ({ id: t.id, filePath: t.filePath, label: t.label }));
    }

    let rawHash = window.location.hash.slice(1);
    let hashPath = '';
    if (rawHash) {
        try { hashPath = decodeURIComponent(rawHash); } catch (e) { hashPath = rawHash; }
    }

    // set initial content before async tab switching
    presetValue(defaultInput);

    setupRefreshButton();
    setupCopyButton(editor);
    setupSaveButton();
    setupExportButton();
    setupFilePathInput();

    // initialise tabs
    if (hashPath) {
        openFileTab(hashPath);
    } else if (tabs.length > 0) {
        let startId = (persistedActiveId && tabs.find((t) => t.id === persistedActiveId))
            ? persistedActiveId
            : tabs[0].id;
        switchToTab(startId);
    } else {
        // fresh start - migrate old last_state if present
        let lastContent = loadLastContent();
        let tab = { id: crypto.randomUUID(), filePath: null, label: nextScratchLabel() };
        tabs.push(tab);
        saveScratchContent(tab.id, lastContent || defaultInput);
        activeTabId = tab.id;
        presetValue(lastContent || defaultInput);
        saveTabList();
        renderTabs();
    }

    let scrollBarSettings = loadScrollBarSettings() || false;
    initScrollBarSync(scrollBarSettings);

    // initialize theme (dark/light)
    let themeSettings = loadThemeSettings();
    // normalize to boolean (Storehouse may return string or boolean)
    if (themeSettings === 'true' || themeSettings === true) {
        themeSettings = true;
    } else {
        themeSettings = false;
    }
    initThemeToggle(themeSettings);

    setupDivider();

    window.addEventListener('beforeunload', (e) => {
        if (dirtyTabs.size > 0) {
            e.preventDefault();
            return;
        }
        let hasScratchContent = tabs.some((t) => !t.filePath && scratchHasContent(t.id));
        if (hasScratchContent) {
            e.preventDefault();
        }
    });
};

window.addEventListener("load", () => {
    init();
});
