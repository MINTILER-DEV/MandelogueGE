import { Transform, type Entity, type Runtime } from "@mge/core";
import type { ECSService, SerializedSceneData } from "@mge/ecs";
import type { MGEKernelDiagnostic, MGECModule } from "@mge/kernel";
import type { MGEngineUIService, PanelZone } from "@mge/mgengineui";
import type { SceneService } from "@mge/scene";

export interface EditorProjectFile {
  content: string;
  kind: "config" | "script" | "workspace" | "other";
  path: string;
}

export interface EditorLogEntry {
  id: string;
  level: "error" | "info" | "warn";
  message: string;
  source: string;
  time: string;
}

export interface EditorSavedProject {
  files: EditorProjectFile[];
  layout: Record<string, string[]>;
  scene: SerializedSceneData;
}

export interface EditorStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface EditorService {
  addEntity(name?: string): Entity;
  clearLogs(): void;
  getLogs(): EditorLogEntry[];
  getProjectFiles(): EditorProjectFile[];
  getSelectedEntity(): Entity | null;
  getSelectedFilePath(): string | null;
  getStorageKey(): string;
  isPlaying(): boolean;
  log(level: "error" | "info" | "warn", message: string, source?: string): void;
  openProject(options?: { silent?: boolean }): boolean;
  play(): void;
  refresh(): void;
  saveProject(): void;
  selectEntity(entity: Entity | null): void;
  selectFile(path: string | null): void;
  stop(): void;
  togglePlay(): void;
}

interface EditorWorkspaceLayoutFile {
  layout?: Partial<Record<PanelZone, string[]>>;
}

const WORKSPACE_FILE_PATH = ".mgeworkspace.json";

const editorCoreModule: MGECModule = {
  id: "@mge/editor-core",

  setup(ctx) {
    const diagnostics = ctx.services.has("host:editor-diagnostics")
      ? ctx.services.require<MGEKernelDiagnostic[]>("host:editor-diagnostics")
      : [];
    const ecs = ctx.services.require<ECSService>("ecs");
    const runtime = ctx.services.require<Runtime>("runtime");
    const scene = ctx.services.require<SceneService>("scene");
    const storage = ctx.services.has("host:project-storage")
      ? ctx.services.require<EditorStorageLike>("host:project-storage")
      : resolveStorage();
    const ui = ctx.services.require<MGEngineUIService>("mgengineui");
    let logs: EditorLogEntry[] = [];
    let projectFiles = ctx.services.has("host:project-files")
      ? [...ctx.services.require<EditorProjectFile[]>("host:project-files")]
      : [];
    let selectedEntity: Entity | null = null;
    let selectedFilePath: string | null = projectFiles[0]?.path ?? null;
    let playing = false;

    const editor: EditorService = {
      addEntity(name = `Entity ${scene.getActive().entities.length + 1}`) {
        const entity = ecs.createEntity(name, scene.getActive());
        entity.addComponent(new Transform());
        editor.selectEntity(entity);
        editor.log("info", `Added entity "${name}".`);
        editor.refresh();
        return entity;
      },
      clearLogs() {
        logs = [];
        editor.refresh();
      },
      getLogs() {
        return [
          ...diagnostics.map((entry, index) => ({
            id: `diag:${index}`,
            level: entry.level,
            message: entry.message,
            source: entry.componentId ?? "kernel",
            time: entry.code
          })),
          ...logs
        ];
      },
      getProjectFiles() {
        return projectFiles;
      },
      getSelectedEntity() {
        return selectedEntity;
      },
      getSelectedFilePath() {
        return selectedFilePath;
      },
      getStorageKey() {
        return `mge:editor:${ctx.project.name}`;
      },
      isPlaying() {
        return playing;
      },
      log(level, message, source = "editor") {
        logs = [
          ...logs,
          {
            id: `log:${logs.length + 1}`,
            level,
            message,
            source,
            time: new Date().toLocaleTimeString()
          }
        ];
        editor.refresh();
      },
      openProject(options) {
        const raw = storage?.getItem(editor.getStorageKey());

        if (!raw) {
          applyWorkspaceLayoutFromFiles(projectFiles, ui);

          if (!options?.silent) {
            editor.log("warn", "No saved project snapshot was found.");
          }

          editor.refresh();
          return false;
        }

        let saved: EditorSavedProject;

        try {
          saved = JSON.parse(raw) as EditorSavedProject;
        } catch (error) {
          editor.log("error", `Saved project snapshot is invalid JSON: ${String(error)}`);
          applyWorkspaceLayoutFromFiles(projectFiles, ui);
          editor.refresh();
          return false;
        }

        ecs.restoreScene(saved.scene, scene.getActive());
        projectFiles = saved.files ?? projectFiles;
        selectedEntity = scene.getActive().entities[0] ?? null;
        selectedFilePath = projectFiles[0]?.path ?? null;
        ui.panels.applyLayout(saved.layout ?? resolveWorkspaceLayout(projectFiles));
        playing = false;
        runtime.stopLoop();
        runtime.tick(0);

        if (!options?.silent) {
          editor.log("info", "Loaded project snapshot.");
        }

        editor.refresh();
        return true;
      },
      play() {
        runtime.startLoop();
        playing = true;
        ui.setStatus("Playing");
        editor.log("info", "Runtime playing.");
        editor.refresh();
      },
      refresh() {
        if (!playing) {
          runtime.tick(runtime.isRunning() ? undefined : 0);
        }
        ui.invalidate();
      },
      saveProject() {
        const layout = ui.panels.getLayout();
        projectFiles = upsertProjectFile(projectFiles, {
          content: serializeWorkspaceLayoutFile(layout),
          kind: "workspace",
          path: WORKSPACE_FILE_PATH
        });

        const saved: EditorSavedProject = {
          files: projectFiles,
          layout,
          scene: ecs.snapshotScene(scene.getActive())
        };

        storage?.setItem(editor.getStorageKey(), JSON.stringify(saved));
        editor.log("info", "Saved project snapshot.");
      },
      selectEntity(entity) {
        selectedEntity = entity;
        editor.refresh();
      },
      selectFile(path) {
        selectedFilePath = path;
        editor.refresh();
      },
      stop() {
        runtime.stopLoop();
        playing = false;
        ui.setStatus("Stopped");
        editor.log("info", "Runtime stopped.");
        editor.refresh();
      },
      togglePlay() {
        if (playing) {
          editor.stop();
          return;
        }

        editor.play();
      }
    };

    registerEditorChrome(ui, editor, ctx.project.name);
    ctx.services.provide("editor", editor, ctx.component.id);
    ctx.log.info("Registered the editor core service.");
  },

  start(ctx) {
    const editor = ctx.services.require<EditorService>("editor");
    const ui = ctx.services.require<MGEngineUIService>("mgengineui");

    ui.mount();
    ui.setBranding({
      subtitle: ctx.project.name,
      title: "MandelogueGE Editor"
    });
    ui.setStatus("Stopped");

    const opened = editor.openProject({ silent: true });

    if (!opened) {
      const scene = ctx.services.require<SceneService>("scene").getActive();
      editor.selectEntity(scene.entities[0] ?? null);
      editor.refresh();
    }
  }
};

function registerEditorChrome(ui: MGEngineUIService, editor: EditorService, projectName: string): void {
  ui.commands.register({
    id: "editor.open",
    run: () => {
      editor.openProject();
    },
    title: "Open Project",
    toolbar: true
  });
  ui.commands.register({
    id: "editor.save",
    run: () => {
      editor.saveProject();
    },
    title: "Save Project",
    toolbar: true
  });
  ui.commands.register({
    id: "editor.play-toggle",
    run: () => {
      editor.togglePlay();
    },
    title: "Play / Stop",
    toolbar: true
  });
  ui.commands.register({
    id: "editor.add-entity",
    run: () => {
      editor.addEntity();
    },
    title: "Add Entity",
    toolbar: true
  });
  ui.commands.register({
    id: "editor.clear-logs",
    run: () => {
      editor.clearLogs();
    },
    title: "Clear Console"
  });
  ui.commands.register({
    id: "editor.palette",
    run: () => {
      ui.commands.openPalette();
    },
    title: "Open Command Palette"
  });

  ui.menus.register({
    id: "file",
    items: [
      { action: () => editor.openProject(), label: "Open Project" },
      { action: () => editor.saveProject(), label: "Save Project" }
    ],
    label: "File"
  });
  ui.menus.register({
    id: "run",
    items: [
      { action: () => editor.play(), label: "Play" },
      { action: () => editor.stop(), label: "Stop" }
    ],
    label: "Run"
  });
  ui.menus.register({
    id: "view",
    items: [
      { action: () => ui.commands.openPalette(), label: "Command Palette" },
      { action: () => editor.clearLogs(), label: "Clear Console" }
    ],
    label: "View"
  });
  ui.setBranding({
    subtitle: projectName,
    title: "MandelogueGE Editor"
  });
}

function applyWorkspaceLayoutFromFiles(files: EditorProjectFile[], ui: MGEngineUIService): void {
  ui.panels.applyLayout(resolveWorkspaceLayout(files));
}

function resolveWorkspaceLayout(files: EditorProjectFile[]): Partial<Record<PanelZone, string[]>> {
  const file = files.find((candidate) => candidate.path === WORKSPACE_FILE_PATH);

  if (!file) {
    return {};
  }

  try {
    const parsed = JSON.parse(file.content) as EditorWorkspaceLayoutFile;

    if (!parsed || typeof parsed !== "object" || !parsed.layout || typeof parsed.layout !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed.layout).filter(
        ([zone, panelIds]) =>
          isPanelZone(zone) && Array.isArray(panelIds) && panelIds.every((panelId) => typeof panelId === "string")
      )
    ) as Partial<Record<PanelZone, string[]>>;
  } catch {
    return {};
  }
}

function serializeWorkspaceLayoutFile(layout: Record<PanelZone, string[]>): string {
  return `${JSON.stringify({ layout }, null, 2)}\n`;
}

function isPanelZone(value: string): value is PanelZone {
  return value === "bottom" || value === "center" || value === "left" || value === "right";
}

function upsertProjectFile(files: EditorProjectFile[], nextFile: EditorProjectFile): EditorProjectFile[] {
  const index = files.findIndex((candidate) => candidate.path === nextFile.path);

  if (index < 0) {
    return [...files, nextFile];
  }

  const nextFiles = [...files];
  nextFiles[index] = nextFile;
  return nextFiles;
}

function resolveStorage(): EditorStorageLike | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  return window.localStorage;
}

export default editorCoreModule;
