# Markdown Live Preview

A local-first fork of [tanabe/markdown-live-preview](https://github.com/tanabe/markdown-live-preview)

## Key Features

- **Local File System Support**: Read and write files directly from your local disk via a custom Vite server plugin.
- **Multi-Tab Editor**: Open multiple files or scratchpads simultaneously in a tabbed interface.
- **Focus Mode**: Double-click an active tab to hide the editor and expand the preview to 100% width.
- **Mermaid Diagrams**: Native support for flowcharts, sequence diagrams, and more using Mermaid.js syntax.
- **Syntax Highlighting**: Beautiful code blocks with `highlight.js`, automatically switching between light and dark themes.
- **Themed Dialogs**: Custom alert, confirm, and prompt dialogs
- **Persistent Workspace**: Your open tabs, active file, and even the editor/preview split ratio are saved between sessions.
- **Bidirectional Scroll Sync**: Perfectly synchronized scrolling between the editor and the preview.
- **Privacy Focused**: All Google Analytics tracking has been removed.

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm

### Installation

```bash
# Install dependencies
make setup
```

### Local Development

Start the development server with local file system access enabled:

```bash
make dev
```

The application will be available at `http://localhost:41773`.

### Building for Production

```bash
make build
```

## Usage Tips

- **Open File**: Type a path (e.g., `~/Desktop/notes.md`) into the file path input in the header.
- **Focus Mode**: Double-click any active tab to toggle between the split-view and a full-width preview.
- **Save Scratchpads**: Click the `+` button to create a scratchpad; use the "Save" button to prompted for a local filename.
- **Refresh from Disk**: Click "Refresh" to re-read the current file from disk if it was modified externally.
- **Sync Scroll**: Toggle bidirectional scroll synchronization in the header.

## License

See the [LICENSE](LICENSE) file for details.
