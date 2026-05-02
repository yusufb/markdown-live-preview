# Markdown Live Preview

A local-first fork of [tanabe/markdown-live-preview](https://github.com/tanabe/markdown-live-preview)

## Key Features

- **Multi-Tab Editor**: Open multiple files or scratchpads simultaneously in a tabbed interface.
- **Local File System Support**: Read and write files directly from your local disk via a custom Vite server plugin.
- **URL Hash Navigation**: Open specific local files directly via URL (e.g., `http://localhost:41773/#~/docs/notes.md`).
- **Syntax Highlighting**: Beautiful code blocks with `highlight.js`, automatically switching between light and dark themes.
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

This app supports Mermaid diagrams in fenced code blocks using the `mermaid` language tag.

### Building for Production

```bash
make build
```

## Usage Tips

- **Open File**: Type a path (e.g., `~/Desktop/notes.md`) into the file path input in the header.
- **Save**: Use the "Save" button to write changes back to the local file.
- **Scratchpads**: Click the `+` button in the tab bar to create a temporary scratchpad.
- **Sync Scroll**: Toggle bidirectional scroll synchronization in the header.

## License

See the [LICENSE](LICENSE) file for details.
