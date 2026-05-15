# Python Debug Panel

`vscode-py-debug-panel` is a VS Code extension that lets you paste shell-style multiline arguments, choose a Python file from the current workspace, and launch or debug it from a sidebar panel.

## Features

- Sidebar panel for Python debugging.
- Workspace Python file selector, defaulting to the active Python editor when possible.
- Multiline argument input using shell-style parsing.
- Recent argument history, stored per workspace.
- `Run` and `Debug` buttons that reuse the same selected file and parsed arguments.
- Commands for opening the panel, refreshing files, running, and debugging.

Example argument block:

```sh
--inputs \
/path/to/results/project-a/experiment-baseline/test_results/ \
/path/to/results/project-a/experiment-candidate/test_results/ \
--labels \
Baseline \
Candidate \
--save_file \
compare
```

The panel parses that into:

```json
[
  "--inputs",
  "/path/to/results/project-a/experiment-baseline/test_results/",
  "/path/to/results/project-a/experiment-candidate/test_results/",
  "--labels",
  "Baseline",
  "Candidate",
  "--save_file",
  "compare"
]
```

## Requirements

- Desktop VS Code.
- The official Python extension/debugpy support installed in VS Code.
- Node.js and npm for development.
- `vsce` for creating a `.vsix` package.
- `gh` if you want to create and push the GitHub repository from the command line.

This environment did not have `node`, `npm`, `vsce`, or `gh` available when the project was created, so package installation, compilation, VSIX creation, and GitHub upload must be run after those tools are installed.

## Development

```sh
npm install
npm run compile
npm test
```

To debug the extension:

1. Open this folder in VS Code.
2. Press `F5`.
3. In the Extension Development Host, open a Python workspace.
4. Open the `Python Debug` activity bar item.
5. Select a Python file, paste arguments, and click `Run` or `Debug`.

## Packaging

Install `vsce` if needed:

```sh
npm install -g @vscode/vsce
```

Build the VSIX:

```sh
npm run package
```

Install the generated package from VS Code:

```sh
code --install-extension vscode-py-debug-panel-0.1.1.vsix
```

## Settings

- `pythonDebugPanel.debugType`: Debug configuration type. Defaults to `debugpy`.
- `pythonDebugPanel.historyLimit`: Number of recent argument blocks to keep. Defaults to `10`.
- `pythonDebugPanel.console`: Debug console. Defaults to `integratedTerminal`.

## Commands

- `Python Debug Panel: Open`
- `Python Debug Panel: Debug Selected`
- `Python Debug Panel: Run Selected`
- `Python Debug Panel: Refresh Files`
