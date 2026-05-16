import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/min/vs/editor/editor.main.css";
import "monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution";
import "monaco-editor/esm/vs/language/json/monaco.contribution";
import "monaco-editor/esm/vs/language/typescript/monaco.contribution";

import * as coreModule from "@mge/core";
import type { EditorEvent, EditorProjectFile, EditorService } from "@mge/editor-core";
import type { MGECModule } from "@mge/kernel";
import type { MGEngineUIService } from "@mge/mgengineui";
import type { ScriptRuntimeService } from "@mge/scripting-ts";
import { compileTypeScriptModule, evaluateCommonJsModule } from "./script-compiler.js";
import { readScriptEditableValues, type ScriptEditableValue, updateScriptEditableValue } from "./script-properties.js";

export interface TextEditorService {
  createScript(path?: string): EditorProjectFile | null;
  find(): void;
  focus(): void;
  getActivePath(): string | null;
  getScriptEditableValues(path: string): Record<string, ScriptEditableValue>;
  initialize(): void;
  openFile(path: string, options?: { activatePanel?: boolean }): void;
  replace(): void;
  saveActiveFile(): Promise<boolean>;
  updateScriptProperty(path: string, propertyName: string, value: ScriptEditableValue): boolean;
}

interface InternalTextEditorService extends TextEditorService {
  __panelRoot: HTMLElement;
}

const PANEL_ID = "text-editor";
const PANEL_STYLE_ID = "mge-editor-text-styles";
const SCRIPT_LANGUAGE_LIB_URI = "file:///mge/types/@mge-core-scripting.d.ts";
const SCRIPT_LANGUAGE_LIB = `
declare module "@mge/core" {
  export interface KeyboardInputLike {
    keyDown(code: string): boolean;
  }

  export class Component {
    entity: Entity;
  }

  export class Transform extends Component {
    rotation: number;
    scaleX: number;
    scaleY: number;
    x: number;
    y: number;
  }

  export class Entity {
    id: string;
    name: string;
    scene: Scene | null;
  }

  export class Scene {
    id: string;
    name: string;
  }

  export class Runtime {}

  export class Script {
    entity: Entity;
    readonly input: KeyboardInputLike;
    readonly runtime: Runtime;
    readonly scene: Scene;
    readonly time: {
      delta: number;
      elapsed: number;
      frame: number;
      scale: number;
    };
    readonly transform: Transform;
    requireService<T>(id: string): T;
    start(): void;
    update(dt: number): void;
    render(): void;
    destroy(): void;
  }
}
`.trim();
let monacoConfigured = false;

const editorTextModule: MGECModule = {
  id: "@mge/editor-text",

  setup(ctx) {
    const ui = ctx.services.require<MGEngineUIService>("mgengineui");
    const editor = ctx.services.require<EditorService>("editor");
    const scriptRuntime = ctx.services.has("script-runtime")
      ? ctx.services.require<ScriptRuntimeService>("script-runtime")
      : null;

    configureMonacoLanguageService();

    const textEditor = createTextEditorService({
      editor,
      scriptRuntime,
      ui
    });

    registerTextEditorCommands(ui, editor, textEditor);
    ui.panels.register({
      id: PANEL_ID,
      order: 1,
      render() {
        return textEditor.__panelRoot;
      },
      title: "Text Editor",
      zone: "center"
    });

    ctx.services.provide("text-editor", textEditor, ctx.component.id);
    ctx.log.info("Registered the Monaco text editor.");
  },

  start(ctx) {
    ctx.services.require<TextEditorService>("text-editor").initialize();
  }
};

function createTextEditorService(dependencies: {
  editor: EditorService;
  scriptRuntime: ScriptRuntimeService | null;
  ui: MGEngineUIService;
}): InternalTextEditorService {
  const { editor, scriptRuntime, ui } = dependencies;
  const projectImports = {
    "@mge/core": coreModule
  };
  const dirtyPaths = new Set<string>();
  const modelDisposables = new Map<string, monaco.IDisposable[]>();
  const models = new Map<string, monaco.editor.ITextModel>();
  const openTabs: string[] = [];
  const savedContents = new Map<string, string>();
  const syncingPaths = new Set<string>();
  const panelRoot = document.createElement("div");
  const toolbar = document.createElement("div");
  const tabs = document.createElement("div");
  const host = document.createElement("div");
  let activePath: string | null = null;
  let codeEditor: monaco.editor.IStandaloneCodeEditor | null = null;
  let initialised = false;

  panelRoot.className = "mge-text-editor-panel";
  toolbar.className = "mge-text-editor-toolbar";
  tabs.className = "mge-text-editor-tabs";
  host.className = "mge-text-editor-host";
  panelRoot.append(toolbar, tabs, host);

  const textEditor: InternalTextEditorService = {
    __panelRoot: panelRoot,
    createScript(path) {
      const nextPath = path ?? nextScriptPath(editor);
      const content = createScriptTemplate(classNameFromScriptPath(nextPath));

      editor.updateProjectFile(nextPath, content, {
        kind: "script",
        select: true
      });
      savedContents.set(nextPath, content);
      dirtyPaths.delete(nextPath);
      syncScriptPropertiesFromSource(nextPath, content);
      hotReloadScript(nextPath, content, null);
      textEditor.openFile(nextPath, { activatePanel: true });
      editor.saveProject();
      editor.log("info", `Created "${nextPath}".`, "@mge/editor-text");
      renderPanel();
      return editor.getProjectFile(nextPath);
    },
    find() {
      void codeEditor?.getAction("actions.find")?.run();
    },
    focus() {
      codeEditor?.focus();
    },
    getActivePath() {
      return activePath;
    },
    getScriptEditableValues(path) {
      const file = editor.getProjectFile(path);

      if (!file || !isScriptFile(path)) {
        return {};
      }

      const source = models.get(path)?.getValue() ?? file.content;
      return readScriptEditableValues(source);
    },
    initialize() {
      if (initialised) {
        return;
      }

      initialised = true;
      registerAllProjectScripts();
      const selectedPath = editor.getSelectedFilePath();

      if (activePath && isEditableTextFile(editor.getProjectFile(activePath))) {
        textEditor.openFile(activePath);
      } else if (selectedPath && isEditableTextFile(editor.getProjectFile(selectedPath))) {
        textEditor.openFile(selectedPath);
      } else {
        const firstScriptPath = editor.getProjectFiles().find((file) => isScriptFile(file.path))?.path ?? null;

        if (firstScriptPath) {
          textEditor.openFile(firstScriptPath);
          return;
        }

        renderPanel();
      }
    },
    openFile(path, options) {
      const file = editor.getProjectFile(path);

      if (!isEditableTextFile(file)) {
        return;
      }

      const model = ensureModel(file);

      if (!openTabs.includes(path)) {
        openTabs.push(path);
      }

      activePath = path;
      ensureCodeEditor().setModel(model);
      renderPanel();

      if (options?.activatePanel) {
        ui.panels.setActive(PANEL_ID);
      } else {
        scheduleEditorLayout();
      }
    },
    replace() {
      void codeEditor?.getAction("editor.action.startFindReplaceAction")?.run();
    },
    async saveActiveFile() {
      if (!activePath) {
        return false;
      }

      const model = models.get(activePath);
      const existing = editor.getProjectFile(activePath);

      if (!model || !existing) {
        return false;
      }

      const nextContent = model.getValue();
      editor.updateProjectFile(activePath, nextContent, {
        kind: existing.kind,
        select: true
      });
      savedContents.set(activePath, nextContent);
      dirtyPaths.delete(activePath);

      if (isScriptFile(activePath)) {
        syncScriptPropertiesFromSource(activePath, nextContent);
        hotReloadScript(activePath, nextContent, model);
      }

      editor.saveProject();
      editor.log("info", `Saved "${activePath}".`, "@mge/editor-text");
      renderPanel();
      return true;
    },
    updateScriptProperty(path, propertyName, value) {
      const existing = editor.getProjectFile(path);

      if (!existing || !isScriptFile(path)) {
        return false;
      }

      const model = models.get(path) ?? null;
      const source = model?.getValue() ?? existing.content;
      const nextContent = updateScriptEditableValue(source, propertyName, value);

      if (!nextContent) {
        return false;
      }

      editor.updateProjectFile(path, nextContent, {
        kind: existing.kind,
        select: false
      });

      if (model && model.getValue() !== nextContent) {
        syncingPaths.add(path);
        model.setValue(nextContent);
      }

      savedContents.set(path, nextContent);
      dirtyPaths.delete(path);
      syncScriptPropertiesFromSource(path, nextContent);
      hotReloadScript(path, nextContent, model);
      renderPanel();
      return true;
    }
  };

  editor.subscribe((event) => {
    handleEditorEvent(event);
  });
  renderPanel();

  function handleEditorEvent(event: EditorEvent): void {
    if (event.type === "project-opened") {
      resetModelsFromProject();
      registerAllProjectScripts();
      renderPanel();
      return;
    }

    if (event.type === "files-changed") {
      syncModelsFromProject();
      renderPanel();
      return;
    }

    if (event.type === "file-selection-changed" && event.filePath) {
      if (isEditableTextFile(editor.getProjectFile(event.filePath))) {
        if (!activePath) {
          textEditor.openFile(event.filePath);
        } else if (openTabs.includes(event.filePath)) {
          textEditor.openFile(event.filePath);
        }
      }

      return;
    }

    if (event.type === "refresh") {
      scheduleEditorLayout();
    }
  }

  function hotReloadScript(path: string, source: string, model: monaco.editor.ITextModel | null): void {
    if (!scriptRuntime) {
      return;
    }

    const errorMarkers = model
      ? monaco.editor
          .getModelMarkers({ resource: model.uri })
          .filter((marker) => marker.severity === monaco.MarkerSeverity.Error)
      : [];

    if (errorMarkers.length > 0) {
      editor.log(
        "warn",
        `Skipped hot reload for "${path}" because Monaco reported ${errorMarkers.length} error(s).`,
        "@mge/editor-text"
      );
      return;
    }

    const compilation = compileTypeScriptModule(source, path);

    if (compilation.diagnostics.length > 0) {
      editor.log(
        "warn",
        `Transpiled "${path}" with ${compilation.diagnostics.length} compiler warning(s).`,
        "@mge/editor-text"
      );
    }

    try {
      const moduleLike = evaluateCommonJsModule(compilation.code, path, projectImports);
      scriptRuntime.registerScript(path, moduleLike as Parameters<ScriptRuntimeService["registerScript"]>[1]);
      const reloadedCount = scriptRuntime.reloadScript(path);
      editor.log("info", `Reloaded "${path}" for ${reloadedCount} live script component(s).`, "@mge/editor-text");

      if (!editor.isPlaying()) {
        editor.refresh();
      }
    } catch (error) {
      editor.log("error", `Hot reload failed for "${path}": ${String(error)}`, "@mge/editor-text");
    }
  }

  function registerAllProjectScripts(): void {
    if (!scriptRuntime) {
      return;
    }

    for (const file of editor.getProjectFiles()) {
      if (!isScriptFile(file.path)) {
        continue;
      }

      try {
        const compilation = compileTypeScriptModule(file.content, file.path);
        const moduleLike = evaluateCommonJsModule(compilation.code, file.path, projectImports);
        scriptRuntime.registerScript(file.path, moduleLike as Parameters<ScriptRuntimeService["registerScript"]>[1]);
      } catch (error) {
        editor.log("error", `Failed to register "${file.path}": ${String(error)}`, "@mge/editor-text");
      }
    }
  }

  function ensureCodeEditor(): monaco.editor.IStandaloneCodeEditor {
    if (!codeEditor) {
      codeEditor = monaco.editor.create(host, {
        automaticLayout: false,
        fontSize: 13,
        insertSpaces: true,
        minimap: { enabled: false },
        model: null,
        parameterHints: { enabled: true },
        quickSuggestions: {
          comments: false,
          other: true,
          strings: true
        },
        renderWhitespace: "selection",
        scrollBeyondLastLine: false,
        snippetSuggestions: "inline",
        suggestOnTriggerCharacters: true,
        tabSize: 2,
        theme: "mge-monaco",
        wordWrap: "off"
      });
      codeEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        void textEditor.saveActiveFile().then((savedFile) => {
          if (!savedFile) {
            editor.saveProject();
          }
        });
      });
      codeEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP, () => {
        ui.commands.openPalette();
      });
    }

    return codeEditor;
  }

  function ensureModel(file: EditorProjectFile): monaco.editor.ITextModel {
    const existing = models.get(file.path);

    if (existing) {
      if (!dirtyPaths.has(file.path) && existing.getValue() !== file.content) {
        savedContents.set(file.path, file.content);
        syncingPaths.add(file.path);
        existing.setValue(file.content);
      }

      return existing;
    }

    const model = monaco.editor.createModel(file.content, resolveLanguage(file.path), resolveUri(file.path));
    savedContents.set(file.path, file.content);
    const disposables: monaco.IDisposable[] = [
      model.onDidChangeContent(() => {
        if (syncingPaths.has(file.path)) {
          syncingPaths.delete(file.path);
          updateDirtyState(file.path, model);
          return;
        }

        updateDirtyState(file.path, model);

        if (isScriptFile(file.path)) {
          syncScriptPropertiesFromSource(file.path, model.getValue());
        }

        renderPanel();
      })
    ];

    models.set(file.path, model);
    modelDisposables.set(file.path, disposables);
    return model;
  }

  function syncModelsFromProject(): void {
    const nextFiles = new Map(editor.getProjectFiles().map((file) => [file.path, file]));

    for (const path of [...models.keys()]) {
      const file = nextFiles.get(path);

      if (!file) {
        disposeModel(path);
        continue;
      }

      if (!dirtyPaths.has(path)) {
        ensureModel(file);
      }
    }

    for (const path of [...openTabs]) {
      if (!nextFiles.has(path)) {
        removeOpenTab(path);
      }
    }

    if (activePath && !nextFiles.has(activePath)) {
      activePath = openTabs[0] ?? null;
      codeEditor?.setModel(activePath ? models.get(activePath) ?? null : null);
    }
  }

  function resetModelsFromProject(): void {
    const nextFiles = new Map(editor.getProjectFiles().map((file) => [file.path, file]));

    for (const path of [...models.keys()]) {
      const file = nextFiles.get(path);

      if (!file) {
        disposeModel(path);
        continue;
      }

      syncingPaths.add(path);
      ensureModel(file).setValue(file.content);
      savedContents.set(path, file.content);
      dirtyPaths.delete(path);
    }

    for (const path of [...openTabs]) {
      if (!nextFiles.has(path)) {
        removeOpenTab(path);
      }
    }

    if (activePath && nextFiles.has(activePath)) {
      codeEditor?.setModel(models.get(activePath) ?? null);
      return;
    }

    const selectedPath = editor.getSelectedFilePath();

    if (selectedPath && isEditableTextFile(editor.getProjectFile(selectedPath))) {
      textEditor.openFile(selectedPath);
      return;
    }

    activePath = openTabs[0] ?? null;
    codeEditor?.setModel(activePath ? models.get(activePath) ?? null : null);
  }

  function disposeModel(path: string): void {
    modelDisposables.get(path)?.forEach((disposable) => disposable.dispose());
    modelDisposables.delete(path);
    models.get(path)?.dispose();
    models.delete(path);
    dirtyPaths.delete(path);
    savedContents.delete(path);
  }

  function removeOpenTab(path: string): void {
    const index = openTabs.indexOf(path);

    if (index >= 0) {
      openTabs.splice(index, 1);
    }
  }

  function renderPanel(): void {
    ensurePanelStyles(panelRoot.ownerDocument);
    toolbar.replaceChildren();
    toolbar.append(
      ui.button.create({
        label: "New Script",
        onClick: () => {
          textEditor.createScript();
        },
        variant: "ghost"
      }),
      ui.button.create({
        label: "Save File",
        onClick: () => {
          void textEditor.saveActiveFile();
        },
        variant: "accent"
      }),
      ui.button.create({
        label: "Find",
        onClick: () => textEditor.find(),
        variant: "ghost"
      }),
      ui.button.create({
        label: "Replace",
        onClick: () => textEditor.replace(),
        variant: "ghost"
      })
    );

    const details = document.createElement("span");
    details.className = "mge-text-editor-toolbar__meta";
    details.textContent = activePath
      ? `${dirtyPaths.has(activePath) ? "Unsaved" : "Saved"} - ${activePath}`
      : "Select a text file from Assets to open it.";
    toolbar.append(details);

    tabs.replaceChildren();

    if (openTabs.length === 0) {
      const empty = document.createElement("p");
      empty.className = "mge-empty";
      empty.textContent = "No files open.";
      tabs.append(empty);
    } else {
      for (const path of openTabs) {
        const button = document.createElement("button");
        button.className = path === activePath ? "mge-text-editor-tab is-active" : "mge-text-editor-tab";
        button.textContent = `${basename(path)}${dirtyPaths.has(path) ? " *" : ""}`;
        button.title = path;
        button.type = "button";
        button.addEventListener("click", () => textEditor.openFile(path));
        tabs.append(button);
      }
    }

    if (activePath) {
      const file = editor.getProjectFile(activePath);

      if (file) {
        ensureCodeEditor().setModel(ensureModel(file));
      }
    } else {
      codeEditor?.setModel(null);
    }

    scheduleEditorLayout();
  }

  function scheduleEditorLayout(): void {
    if (!codeEditor) {
      return;
    }

    globalThis.requestAnimationFrame?.(() => {
      codeEditor?.layout();
    });
  }

  function syncScriptPropertiesFromSource(path: string, source: string): void {
    if (!scriptRuntime) {
      return;
    }

    const updatedCount = scriptRuntime.applyScriptProperties(path, readScriptEditableValues(source));

    if (updatedCount > 0 && !editor.isPlaying()) {
      editor.refresh();
    }
  }

  function updateDirtyState(path: string, model: monaco.editor.ITextModel): void {
    if (model.getValue() === (savedContents.get(path) ?? "")) {
      dirtyPaths.delete(path);
    } else {
      dirtyPaths.add(path);
    }
  }

  return textEditor;
}

function registerTextEditorCommands(
  ui: MGEngineUIService,
  editor: EditorService,
  textEditor: TextEditorService
): void {
  ui.commands.register({
    id: "editor-text.new-script",
    keywords: ["create", "file", "script", "typescript"],
    run: () => {
      textEditor.createScript();
    },
    title: "Create Script"
  });
  ui.commands.register({
    id: "editor-text.focus",
    run: () => {
      ui.panels.setActive(PANEL_ID);
      textEditor.focus();
    },
    title: "Focus Text Editor"
  });
  ui.commands.register({
    id: "editor-text.open-selected",
    run: () => {
      const selectedPath = editor.getSelectedFilePath();

      if (selectedPath) {
        textEditor.openFile(selectedPath, { activatePanel: true });
      }
    },
    title: "Open Selected File In Text Editor"
  });
  ui.commands.register({
    id: "editor-text.save-active",
    keybinding: "Ctrl+S",
    run: () => {
      void textEditor.saveActiveFile().then((savedFile) => {
        if (!savedFile) {
          editor.saveProject();
        }
      });
    },
    title: "Save Active File"
  });
  ui.commands.register({
    id: "editor-text.find",
    keybinding: "Ctrl+F",
    run: () => {
      textEditor.find();
    },
    title: "Find In File"
  });
  ui.commands.register({
    id: "editor-text.replace",
    keybinding: "Ctrl+H",
    run: () => {
      textEditor.replace();
    },
    title: "Replace In File"
  });
}

function configureMonacoLanguageService(): void {
  if (monacoConfigured) {
    return;
  }

  monacoConfigured = true;

  monaco.editor.defineTheme("mge-monaco", {
    base: "vs-dark",
    colors: {
      "editor.background": "#1e1e1e",
      "editorLineNumber.activeForeground": "#cfd7e3",
      "editorLineNumber.foreground": "#6e7681"
    },
    inherit: true,
    rules: []
  });

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    allowNonTsExtensions: true,
    allowSyntheticDefaultImports: true,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    noEmit: true,
    strict: true,
    target: monaco.languages.typescript.ScriptTarget.ES2020
  });
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false
  });
  monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
  monaco.languages.typescript.typescriptDefaults.addExtraLib(SCRIPT_LANGUAGE_LIB, SCRIPT_LANGUAGE_LIB_URI);
}

function ensurePanelStyles(documentRef: Document): void {
  if (documentRef.getElementById(PANEL_STYLE_ID)) {
    return;
  }

  const style = documentRef.createElement("style");
  style.id = PANEL_STYLE_ID;
  style.textContent = `
    .mge-text-editor-panel {
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      height: 100%;
      min-height: 0;
    }
    .mge-text-editor-toolbar {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin-bottom: 0.5rem;
    }
    .mge-text-editor-toolbar__meta {
      color: var(--mge-text-muted);
      font-size: 0.78rem;
      margin-left: auto;
    }
    .mge-text-editor-tabs {
      align-items: center;
      display: flex;
      gap: 1px;
      margin-bottom: 0.5rem;
      overflow-x: auto;
    }
    .mge-text-editor-tab {
      background: #373737;
      border: 1px solid var(--mge-line);
      color: var(--mge-text);
      cursor: pointer;
      min-height: 1.9rem;
      padding: 0.3rem 0.55rem;
      white-space: nowrap;
    }
    .mge-text-editor-tab.is-active {
      background: #404040;
      box-shadow: inset 0 2px 0 var(--mge-accent);
    }
    .mge-text-editor-host {
      border: 1px solid var(--mge-line);
      height: 100%;
      min-height: 0;
      overflow: hidden;
      width: 100%;
    }
  `;
  documentRef.head.append(style);
}

function resolveLanguage(path: string): string {
  if (path.endsWith(".ts") || path.endsWith(".mgescript.ts")) {
    return "typescript";
  }

  if (path.endsWith(".js")) {
    return "javascript";
  }

  if (path.endsWith(".json")) {
    return "json";
  }

  if (path.endsWith(".md")) {
    return "markdown";
  }

  return "plaintext";
}

function resolveUri(path: string): monaco.Uri {
  return monaco.Uri.parse(`file:///mge/project/${path.replace(/^\.\//, "")}`);
}

function isEditableTextFile(file: EditorProjectFile | null): file is EditorProjectFile {
  if (!file) {
    return false;
  }

  return (
    file.kind === "config" ||
    file.kind === "script" ||
    file.kind === "workspace" ||
    file.path.endsWith(".json") ||
    file.path.endsWith(".js") ||
    file.path.endsWith(".md") ||
    file.path.endsWith(".txt") ||
    file.path.endsWith(".ts")
  );
}

function isScriptFile(path: string): boolean {
  return path.endsWith(".ts") || path.endsWith(".mgescript.ts");
}

function nextScriptPath(editor: EditorService): string {
  const baseName = "NewScript";
  let index = 0;

  while (true) {
    const suffix = index === 0 ? "" : String(index + 1);
    const path = `./scripts/${baseName}${suffix}.ts`;

    if (!editor.getProjectFile(path)) {
      return path;
    }

    index += 1;
  }
}

function createScriptTemplate(className: string): string {
  return [
    'import { Script } from "@mge/core";',
    "",
    `export default class ${className} extends Script {`,
    "  start(): void {",
    "    // Called when the script is first bound to an entity.",
    "  }",
    "",
    "  update(_dt: number): void {",
    "    // Called once per frame.",
    "  }",
    "}",
    ""
  ].join("\n");
}

function classNameFromScriptPath(path: string): string {
  const rawName = basename(path).replace(/\.(?:mgescript\.)?ts$/i, "");
  const tokens = rawName.match(/[A-Za-z0-9]+/g) ?? ["Script"];
  const normalized = tokens
    .map((token) => `${token.slice(0, 1).toUpperCase()}${token.slice(1)}`)
    .join("");

  return /^[A-Za-z_]/.test(normalized) ? normalized : `Script${normalized}`;
}

function basename(path: string): string {
  return path.replace(/\\/g, "/").split("/").at(-1) ?? path;
}

export default editorTextModule;
export { compileTypeScriptModule, evaluateCommonJsModule };
export { readScriptEditableValues, updateScriptEditableValue };
