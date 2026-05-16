import type { AssetRecord, AssetsService } from "@mge/assets";
import type { EditorProjectFile, EditorService } from "@mge/editor-core";
import type { MGECModule } from "@mge/kernel";
import type { MGEngineUIService, MGEngineUITreeNode } from "@mge/mgengineui";

interface TextEditorServiceLike {
  openFile(path: string, options?: { activatePanel?: boolean }): void;
}

interface AssetTreeBranch {
  children: Map<string, AssetTreeBranch>;
  file?: {
    kind: EditorProjectFile["kind"];
    path: string;
  };
  path: string;
}

const ASSET_STYLE_ID = "mge-editor-assets-styles";

const editorAssetsModule: MGECModule = {
  id: "@mge/editor-assets",

  setup(ctx) {
    let preferredMode: "auto" | "explorer" | "preview" = "auto";
    const ui = ctx.services.require<MGEngineUIService>("mgengineui");

    ui.panels.register({
      id: "assets",
      order: 1,
      render(uiService) {
        const editor = ctx.services.require<EditorService>("editor");
        const assets = ctx.services.has("assets") ? ctx.services.require<AssetsService>("assets") : null;
        const textEditor = ctx.services.has("text-editor")
          ? ctx.services.require<TextEditorServiceLike>("text-editor")
          : null;
        const files = editor.getProjectFiles();
        const selectedPath = editor.getSelectedFilePath();
        const zone = uiService.panels.getZone("assets");
        const sideDocked = zone === "left" || zone === "right";
        const explorerMode = preferredMode === "explorer" || (preferredMode === "auto" && sideDocked);
        ensureAssetsStyles(document);

        const stack = document.createElement("div");
        stack.className = explorerMode ? "mge-stack mge-assets-panel is-explorer" : "mge-stack mge-assets-panel";

        stack.append(renderToolbar({
          assets,
          editor,
          onModeChange(mode) {
            preferredMode = mode;
            uiService.invalidate();
          },
          preferredMode
        }, uiService));
        stack.append(uiService.tree.render(buildAssetTree(files, selectedPath, editor, textEditor)));

        const selected = files.find((file) => file.path === selectedPath) ?? null;

        if (selected && !explorerMode) {
          stack.append(renderSelectedPreview(selected, assets, uiService));
        }

        return stack;
      },
      title: "Assets",
      zone: "left"
    });
  }
};

function renderToolbar(
  options: {
    assets: AssetsService | null;
    editor: EditorService;
    onModeChange(mode: "auto" | "explorer" | "preview"): void;
    preferredMode: "auto" | "explorer" | "preview";
  },
  ui: MGEngineUIService
): HTMLElement {
  const toolbar = document.createElement("div");
  toolbar.className = "mge-inline-actions";
  const { assets, editor, onModeChange, preferredMode } = options;

  toolbar.append(
    ui.button.create({
      label: "Auto",
      onClick: () => onModeChange("auto"),
      variant: preferredMode === "auto" ? "accent" : "ghost"
    }),
    ui.button.create({
      label: "Explorer",
      onClick: () => onModeChange("explorer"),
      variant: preferredMode === "explorer" ? "accent" : "ghost"
    }),
    ui.button.create({
      label: "Preview",
      onClick: () => onModeChange("preview"),
      variant: preferredMode === "preview" ? "accent" : "ghost"
    }),
    ui.button.create({
      label: "Import",
      onClick: () => {
        if (!assets) {
          editor.log("warn", "No assets service is registered.", "@mge/editor-assets");
          return;
        }

        void importFilesFromBrowser(assets, editor);
      },
      variant: "accent"
    })
  );

  return toolbar;
}

async function importFilesFromBrowser(assets: AssetsService, editor: EditorService): Promise<void> {
  const input = document.createElement("input");
  input.accept = "*/*";
  input.multiple = true;
  input.type = "file";

  const files = await new Promise<File[]>((resolve) => {
    input.addEventListener(
      "change",
      () => {
        resolve(Array.from(input.files ?? []));
      },
      { once: true }
    );
    input.click();
  });

  if (files.length === 0) {
    return;
  }

  const descriptors = await Promise.all(files.map((file) => readFileDescriptor(file)));
  const imported = assets.importFiles(descriptors);

  if (imported.length > 0) {
    editor.selectFile(imported[0]?.path ?? null);
    editor.log("info", `Imported ${imported.length} asset(s).`, "@mge/editor-assets");
    editor.refresh();
  }
}

async function readFileDescriptor(file: File): Promise<{ content: string; fileName: string; mimeType: string }> {
  const mimeType = file.type || inferMimeType(file.name);
  const content = shouldReadAsText(file.name, mimeType) ? await file.text() : await readAsDataUrl(file);

  return {
    content,
    fileName: file.name,
    mimeType
  };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(reader.error ?? new Error(`Failed to read "${file.name}".`)));
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.readAsDataURL(file);
  });
}

function shouldReadAsText(fileName: string, mimeType: string): boolean {
  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/javascript" ||
    mimeType === "application/typescript" ||
    /\.(?:json|md|mgescript\.ts|txt|ts|js)$/i.test(fileName)
  );
}

function inferMimeType(fileName: string): string {
  if (fileName.endsWith(".png")) {
    return "image/png";
  }

  if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (fileName.endsWith(".json")) {
    return "application/json";
  }

  if (fileName.endsWith(".ts")) {
    return "application/typescript";
  }

  if (fileName.endsWith(".js")) {
    return "application/javascript";
  }

  return "application/octet-stream";
}

function renderSelectedPreview(
  selected: EditorProjectFile,
  assets: AssetsService | null,
  ui: MGEngineUIService
): HTMLElement {
  const stack = document.createElement("div");
  stack.className = "mge-stack";
  const assetRecord = assets?.getAsset(selected.path) ?? null;

  if (assetRecord) {
    stack.append(
      ui.propertyGrid.render([
        { kind: "text", label: "Path", readOnly: true, value: assetRecord.path },
        { kind: "text", label: "Type", readOnly: true, value: assetRecord.meta.type },
        { kind: "text", label: "Importer", readOnly: true, value: assetRecord.meta.importer },
        { kind: "text", label: "Meta", readOnly: true, value: assetRecord.metaPath }
      ])
    );
    stack.append(renderAssetPreview(assetRecord));
    return stack;
  }

  stack.append(
    ui.propertyGrid.render([
      { kind: "text", label: "Path", readOnly: true, value: selected.path },
      { kind: "text", label: "Kind", readOnly: true, value: selected.kind },
      { kind: "textarea", label: "Preview", readOnly: true, value: selected.content.slice(0, 4000) }
    ])
  );
  return stack;
}

function renderAssetPreview(asset: AssetRecord): HTMLElement {
  const section = document.createElement("section");
  section.className = "mge-section mge-stack";

  if (asset.meta.type.startsWith("image/") && asset.content.startsWith("data:image/")) {
    const image = document.createElement("img");
    image.alt = asset.path;
    image.className = "mge-asset-preview__image";
    image.src = asset.content;
    section.append(image);
    return section;
  }

  const pre = document.createElement("pre");
  pre.className = "mge-asset-preview__text";
  pre.textContent = asset.content.slice(0, 4000);
  section.append(pre);
  return section;
}

function buildAssetTree(
  files: ReturnType<EditorService["getProjectFiles"]>,
  selectedPath: string | null,
  editor: EditorService,
  textEditor: TextEditorServiceLike | null
): MGEngineUITreeNode[] {
  const root: AssetTreeBranch = {
    children: new Map(),
    path: ""
  };

  for (const file of files) {
    const normalizedPath = normalizeAssetPath(file.path);
    const segments = normalizedPath.split("/").filter(Boolean);
    let branch = root;
    let branchPath = "";

    for (const [index, segment] of segments.entries()) {
      branchPath = branchPath ? `${branchPath}/${segment}` : segment;

      if (!branch.children.has(segment)) {
        branch.children.set(segment, {
          children: new Map(),
          path: branchPath
        });
      }

      branch = branch.children.get(segment) as AssetTreeBranch;

      if (index === segments.length - 1) {
        branch.file = {
          kind: file.kind,
          path: file.path
        };
      }
    }
  }

  return materializeAssetNodes(root, selectedPath, editor, textEditor);
}

function materializeAssetNodes(
  branch: AssetTreeBranch,
  selectedPath: string | null,
  editor: EditorService,
  textEditor: TextEditorServiceLike | null
): MGEngineUITreeNode[] {
  return [...branch.children.entries()]
    .sort(([leftName, leftBranch], [rightName, rightBranch]) => {
      const leftIsFolder = !leftBranch.file || leftBranch.children.size > 0;
      const rightIsFolder = !rightBranch.file || rightBranch.children.size > 0;

      if (leftIsFolder !== rightIsFolder) {
        return leftIsFolder ? -1 : 1;
      }

      return leftName.localeCompare(rightName);
    })
    .map(([name, child]) => {
      const childNodes = materializeAssetNodes(child, selectedPath, editor, textEditor);
      const isFile = Boolean(child.file);
      const filePath = child.file?.path ?? null;
      const fileKind = child.file?.kind ?? null;
      const openFile =
        isFile && filePath && fileKind && isEditableTextFile(filePath, fileKind)
          ? () => textEditor?.openFile(filePath, { activatePanel: true })
          : undefined;

      return {
        children: childNodes.length > 0 ? childNodes : undefined,
        icon: isFile ? iconForFile(name, fileKind ?? "other") : "/>",
        label: name,
        onOpen: openFile,
        onSelect: isFile && filePath ? () => editor.selectFile(filePath) : undefined,
        selected: Boolean(filePath && filePath === selectedPath),
        trailing: isFile ? fileKind ?? undefined : undefined
      } satisfies MGEngineUITreeNode;
    });
}

function normalizeAssetPath(path: string): string {
  return path.replace(/^\.\//, "");
}

function isEditableTextFile(path: string, kind: EditorProjectFile["kind"]): boolean {
  return (
    kind === "assetmeta" ||
    kind === "config" ||
    kind === "lockfile" ||
    kind === "script" ||
    kind === "workspace" ||
    path.endsWith(".json") ||
    path.endsWith(".js") ||
    path.endsWith(".md") ||
    path.endsWith(".txt") ||
    path.endsWith(".ts")
  );
}

function iconForFile(path: string, kind: EditorProjectFile["kind"]): string {
  if (kind === "assetmeta") {
    return "M";
  }

  if (kind === "asset") {
    return path.match(/\.(png|jpe?g|gif|webp)$/i) ? "I" : "A";
  }

  if (path.endsWith(".json")) {
    return "{}";
  }

  if (path.endsWith(".ts")) {
    return "TS";
  }

  if (path.endsWith(".js")) {
    return "JS";
  }

  if (path.endsWith(".md")) {
    return "MD";
  }

  return "--";
}

function ensureAssetsStyles(documentRef: Document): void {
  if (documentRef.getElementById(ASSET_STYLE_ID)) {
    return;
  }

  const style = documentRef.createElement("style");
  style.id = ASSET_STYLE_ID;
  style.textContent = `
    .mge-assets-panel.is-explorer .mge-property-grid {
      display: none;
    }
    .mge-assets-panel.is-explorer .mge-tree {
      gap: 0.1rem;
    }
    .mge-assets-panel.is-explorer .mge-tree-node {
      background: transparent;
      border-color: transparent;
      justify-content: flex-start;
      padding: 0.14rem 0.35rem;
    }
    .mge-assets-panel.is-explorer .mge-tree-node:hover {
      background: rgba(255, 255, 255, 0.04);
    }
    .mge-assets-panel.is-explorer .mge-tree-node.is-selected {
      background: rgba(55, 148, 255, 0.18);
    }
    .mge-assets-panel.is-explorer .mge-tree-node__main {
      gap: 0.3rem;
    }
    .mge-assets-panel.is-explorer .mge-tree-node__trailing {
      display: none;
    }
    .mge-assets-panel.is-explorer .mge-tree-children {
      border-left-color: rgba(255, 255, 255, 0.08);
      margin-left: 0.5rem;
      padding-left: 0.5rem;
    }
    .mge-asset-preview__image {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--mge-line-soft);
      display: block;
      max-height: 22rem;
      max-width: 100%;
      object-fit: contain;
      padding: 0.35rem;
    }
    .mge-asset-preview__text {
      background: #1b1b1b;
      border: 1px solid var(--mge-line);
      margin: 0;
      max-height: 16rem;
      overflow: auto;
      padding: 0.55rem;
      white-space: pre-wrap;
      word-break: break-word;
    }
  `;
  documentRef.head.append(style);
}

export default editorAssetsModule;
