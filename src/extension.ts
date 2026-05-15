import * as path from "path";
import * as vscode from "vscode";
import { ArgumentParseError, parseShellArgs } from "./argsParser";

type FileOption = {
  label: string;
  path: string;
};

type PersistedState = {
  selectedFile?: string;
  argsText: string;
  history: string[];
};

type ViewState = PersistedState & {
  files: FileOption[];
  workspacePath?: string;
  message?: string;
  error?: string;
};

const VIEW_ID = "pythonDebugPanel.view";
const DEFAULT_STATE: PersistedState = {
  argsText: "",
  history: []
};

export function activate(context: vscode.ExtensionContext): void {
  const provider = new PythonDebugPanelProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.commands.registerCommand("pythonDebugPanel.open", async () => {
      await vscode.commands.executeCommand("workbench.view.extension.pythonDebugPanel");
    }),
    vscode.commands.registerCommand("pythonDebugPanel.debugSelected", async () => {
      await provider.debugCurrent();
    }),
    vscode.commands.registerCommand("pythonDebugPanel.runSelected", async () => {
      await provider.runCurrent();
    }),
    vscode.commands.registerCommand("pythonDebugPanel.refreshFiles", async () => {
      await provider.refreshFiles();
    })
  );
}

export function deactivate(): void {
  // Nothing to dispose beyond registered subscriptions.
}

class PythonDebugPanelProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private files: FileOption[] = [];
  private state: PersistedState = { ...DEFAULT_STATE };

  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true
    };

    this.state = this.loadState();
    await this.refreshFiles(false);

    webviewView.webview.html = this.renderHtml(webviewView.webview);
    this.postState();

    webviewView.webview.onDidReceiveMessage(
      async (message: { type: string; selectedFile?: string; argsText?: string }) => {
        switch (message.type) {
          case "ready":
            this.postState();
            break;
          case "stateChanged":
            this.patchState(message);
            await this.saveState();
            break;
          case "debug":
            this.patchState(message);
            await this.debugCurrent();
            break;
          case "run":
            this.patchState(message);
            await this.runCurrent();
            break;
          case "refresh":
            this.patchState(message);
            await this.refreshFiles();
            break;
          case "clear":
            this.state.argsText = "";
            await this.saveState();
            this.postState({ message: "Argument input cleared." });
            break;
          default:
            break;
        }
      }
    );
  }

  async refreshFiles(showMessage = true): Promise<void> {
    const workspaceFolder = getPrimaryWorkspaceFolder();
    if (!workspaceFolder) {
      this.files = [];
      this.state.selectedFile = undefined;
      this.postState({ error: "Open a workspace folder before using Python Debug Panel." });
      return;
    }

    const exclude = "{**/.venv/**,**/venv/**,**/env/**,**/node_modules/**,**/__pycache__/**,**/.git/**}";
    const uris = await vscode.workspace.findFiles("**/*.py", exclude, 1000);
    this.files = uris
      .filter((uri) => uri.scheme === "file")
      .map((uri) => ({
        label: vscode.workspace.asRelativePath(uri, false),
        path: uri.fsPath
      }))
      .sort((left, right) => left.label.localeCompare(right.label));

    const activeFile = getActivePythonFile();
    const activeWorkspaceFile = activeFile && this.files.some((file) => file.path === activeFile) ? activeFile : undefined;
    const selectedStillExists = this.state.selectedFile
      ? this.files.some((file) => file.path === this.state.selectedFile)
      : false;

    if (!selectedStillExists) {
      this.state.selectedFile = activeWorkspaceFile ?? this.files[0]?.path;
    }

    await this.saveState();
    this.postState(showMessage ? { message: `Found ${this.files.length} Python file(s).` } : undefined);
  }

  async debugCurrent(): Promise<void> {
    await this.launchCurrent("debug");
  }

  async runCurrent(): Promise<void> {
    await this.launchCurrent("run");
  }

  private async launchCurrent(mode: "debug" | "run"): Promise<void> {
    const workspaceFolder = getPrimaryWorkspaceFolder();
    if (!workspaceFolder) {
      this.postState({ error: `Open a workspace folder before starting ${mode}.` });
      return;
    }

    if (!this.state.selectedFile) {
      this.postState({ error: `Select a Python file before starting ${mode}.` });
      return;
    }

    const programUri = vscode.Uri.file(this.state.selectedFile);
    try {
      await vscode.workspace.fs.stat(programUri);
    } catch {
      this.postState({ error: `Python file does not exist: ${this.state.selectedFile}` });
      return;
    }

    let args: string[];
    try {
      args = parseShellArgs(this.state.argsText);
    } catch (error) {
      const message = error instanceof ArgumentParseError ? error.message : String(error);
      this.postState({ error: message });
      return;
    }

    await this.rememberArguments(this.state.argsText);

    const config = vscode.workspace.getConfiguration("pythonDebugPanel");
    const debugType = config.get<string>("debugType", "debugpy");
    const consoleType = config.get<string>("console", "integratedTerminal");
    const selectedWorkspaceFolder = vscode.workspace.getWorkspaceFolder(programUri) ?? workspaceFolder;
    const actionLabel = mode === "debug" ? "Debug" : "Run";
    const debugConfig: vscode.DebugConfiguration = {
      name: `${actionLabel} ${path.basename(this.state.selectedFile)}`,
      type: debugType,
      request: "launch",
      program: this.state.selectedFile,
      args,
      cwd: selectedWorkspaceFolder.uri.fsPath,
      console: consoleType
    };

    const started = await vscode.debug.startDebugging(
      selectedWorkspaceFolder,
      debugConfig,
      mode === "run" ? { noDebug: true } : undefined
    );
    if (started) {
      this.postState({ message: `Started ${mode} with ${args.length} argument(s).` });
    } else {
      this.postState({ error: `VS Code did not start the ${mode} session.` });
    }
  }

  private patchState(message: { selectedFile?: string; argsText?: string }): void {
    if (typeof message.selectedFile === "string") {
      this.state.selectedFile = message.selectedFile || undefined;
    }
    if (typeof message.argsText === "string") {
      this.state.argsText = message.argsText;
    }
  }

  private async rememberArguments(argsText: string): Promise<void> {
    const trimmed = argsText.trim();
    if (!trimmed) {
      await this.saveState();
      return;
    }

    const config = vscode.workspace.getConfiguration("pythonDebugPanel");
    const limit = Math.max(1, config.get<number>("historyLimit", 10));
    this.state.history = [trimmed, ...this.state.history.filter((item) => item !== trimmed)].slice(0, limit);
    await this.saveState();
  }

  private loadState(): PersistedState {
    const stored = this.context.globalState.get<PersistedState>(this.storageKey());
    return {
      selectedFile: stored?.selectedFile,
      argsText: stored?.argsText ?? "",
      history: Array.isArray(stored?.history) ? stored.history : []
    };
  }

  private async saveState(): Promise<void> {
    await this.context.globalState.update(this.storageKey(), this.state);
  }

  private storageKey(): string {
    const workspaceFolder = getPrimaryWorkspaceFolder();
    return `pythonDebugPanel:${workspaceFolder?.uri.fsPath ?? "no-workspace"}`;
  }

  private buildState(extra?: { message?: string; error?: string }): ViewState {
    const workspaceFolder = getPrimaryWorkspaceFolder();
    return {
      ...this.state,
      files: this.files,
      workspacePath: workspaceFolder?.uri.fsPath,
      message: extra?.message,
      error: extra?.error
    };
  }

  private postState(extra?: { message?: string; error?: string }): void {
    this.view?.webview.postMessage({
      type: "state",
      state: this.buildState(extra)
    });
  }

  private renderHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const initialState = JSON.stringify(this.buildState()).replace(/</g, "\\u003c");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Python Debug Panel</title>
  <style>
    body {
      padding: 12px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }

    label {
      display: block;
      margin: 0 0 6px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      font-weight: 600;
    }

    select,
    textarea,
    button {
      box-sizing: border-box;
      width: 100%;
      font: inherit;
    }

    select,
    textarea {
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      padding: 6px 8px;
      outline-color: var(--vscode-focusBorder);
    }

    textarea {
      min-height: 210px;
      resize: vertical;
      line-height: 1.45;
      font-family: var(--vscode-editor-font-family);
    }

    button {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: 0;
      padding: 7px 10px;
      cursor: pointer;
    }

    button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    button.secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }

    button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    button:disabled,
    select:disabled,
    textarea:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .field {
      margin-bottom: 12px;
    }

    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 8px;
    }

    .status {
      min-height: 18px;
      margin-top: 10px;
      color: var(--vscode-descriptionForeground);
      overflow-wrap: anywhere;
    }

    .status.error {
      color: var(--vscode-errorForeground);
    }

    .meta {
      margin: -4px 0 12px;
      color: var(--vscode-descriptionForeground);
      overflow-wrap: anywhere;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="field">
    <label for="fileSelect">Python file</label>
    <select id="fileSelect"></select>
  </div>

  <div class="meta" id="workspaceInfo"></div>

  <div class="field">
    <label for="historySelect">Recent arguments</label>
    <select id="historySelect"></select>
  </div>

  <div class="field">
    <label for="argsText">Arguments</label>
    <textarea id="argsText" spellcheck="false" placeholder="--inputs \\
/path/to/test_results \\
--labels PA-ANC \\
--save_file compare"></textarea>
  </div>

  <div class="row">
    <button id="debugButton">Debug</button>
    <button id="runButton">Run</button>
  </div>
  <div class="row">
    <button id="refreshButton" class="secondary">Refresh</button>
    <button id="clearButton" class="secondary">Clear</button>
  </div>

  <div id="status" class="status"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = ${initialState};

    const fileSelect = document.getElementById("fileSelect");
    const historySelect = document.getElementById("historySelect");
    const argsText = document.getElementById("argsText");
    const debugButton = document.getElementById("debugButton");
    const runButton = document.getElementById("runButton");
    const refreshButton = document.getElementById("refreshButton");
    const clearButton = document.getElementById("clearButton");
    const status = document.getElementById("status");
    const workspaceInfo = document.getElementById("workspaceInfo");

    function post(type) {
      vscode.postMessage({
        type,
        selectedFile: fileSelect.value,
        argsText: argsText.value
      });
    }

    function render(nextState) {
      state = nextState;
      const hasWorkspace = Boolean(state.workspacePath);
      const hasFiles = Array.isArray(state.files) && state.files.length > 0;

      fileSelect.innerHTML = "";
      if (hasFiles) {
        for (const file of state.files) {
          const option = document.createElement("option");
          option.value = file.path;
          option.textContent = file.label;
          fileSelect.appendChild(option);
        }
      } else {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = hasWorkspace ? "No Python files found" : "No workspace open";
        fileSelect.appendChild(option);
      }
      fileSelect.value = state.selectedFile || "";

      historySelect.innerHTML = "";
      const emptyHistory = document.createElement("option");
      emptyHistory.value = "";
      emptyHistory.textContent = state.history.length ? "Choose recent arguments..." : "No recent arguments";
      historySelect.appendChild(emptyHistory);
      for (const item of state.history) {
        const option = document.createElement("option");
        option.value = item;
        option.textContent = firstLine(item);
        historySelect.appendChild(option);
      }

      if (argsText.value !== state.argsText) {
        argsText.value = state.argsText || "";
      }

      workspaceInfo.textContent = state.workspacePath ? state.workspacePath : "Open a workspace folder to list Python files.";
      status.textContent = state.error || state.message || "";
      status.className = state.error ? "status error" : "status";

      fileSelect.disabled = !hasFiles;
      historySelect.disabled = !state.history.length;
      argsText.disabled = !hasWorkspace;
      debugButton.disabled = !hasWorkspace || !hasFiles;
      runButton.disabled = !hasWorkspace || !hasFiles;
    }

    function firstLine(value) {
      const compact = value.replace(/\\s+/g, " ").trim();
      return compact.length > 80 ? compact.slice(0, 77) + "..." : compact;
    }

    fileSelect.addEventListener("change", () => post("stateChanged"));
    argsText.addEventListener("input", () => post("stateChanged"));
    debugButton.addEventListener("click", () => post("debug"));
    runButton.addEventListener("click", () => post("run"));
    refreshButton.addEventListener("click", () => post("refresh"));
    clearButton.addEventListener("click", () => post("clear"));
    historySelect.addEventListener("change", () => {
      if (historySelect.value) {
        argsText.value = historySelect.value;
        post("stateChanged");
      }
    });

    window.addEventListener("message", (event) => {
      if (event.data && event.data.type === "state") {
        render(event.data.state);
      }
    });

    render(state);
    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
  }
}

function getPrimaryWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.workspaceFolders?.[0];
}

function getActivePythonFile(): string | undefined {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor || activeEditor.document.uri.scheme !== "file") {
    return undefined;
  }

  if (activeEditor.document.languageId !== "python" && !activeEditor.document.uri.fsPath.endsWith(".py")) {
    return undefined;
  }

  return activeEditor.document.uri.fsPath;
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let index = 0; index < 32; index += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}
