# Better All United

## English

A small browser extension that enhances the All United website by adding improved import functionality (Excel/clipboard) and UI helpers.

### Features

- Excel import support (uses `xlsx`) for event participants
- Improved name search functionality for participant and invoice pages
- Fast search functionality for member lists

### Requirements

- Node.js (recommended >= 18)
- pnpm (recommended) or npm/yarn

### Install

Install dependencies:

```bash
pnpm install
```

If you prefer npm:

```bash
npm install
```

### Development

Run a development build with file watching:

```bash
pnpm dev
```

This runs `webpack --mode development --watch` and outputs the bundle to `dist/` as configured in the build.

### Build

To create a production build:

```bash
pnpm build
```

This runs `webpack --mode production` and produces a minified bundle in `dist/`.

### Type checking

Run TypeScript type checks (no emit):

```bash
pnpm type-check
```

### Loading the extension in your browser

1. Build the project (`pnpm build` or `pnpm dev`).
2. Open your browser's extensions page (e.g., in Chrome: `chrome://extensions/`).
3. Enable Developer mode.
4. Click "Load unpacked" and select the project root (the folder containing `manifest.json`).

The extension will match pages under `https://*.allunited.nl/*` as specified in `manifest.json`.

### Tests

No automated tests are included yet.

### Contributing

Contributions are welcome. Suggested steps:

1. Fork the repository
2. Create a feature branch
3. Make changes and add tests where appropriate
4. Open a pull request with a clear description of changes

### License

This project is published under the MIT License (see `package.json`).

### Notes

- The project uses `webpack` and `ts-loader` to compile TypeScript into `dist/bundle.js` referenced by the extension manifest.
- If you add new files that should be included in the extension bundle, ensure webpack is configured to include them.
