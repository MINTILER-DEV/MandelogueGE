import type { EditorService } from "@mge/editor-core";
import type { MGECModule } from "@mge/kernel";
import type { MGEngineUIService, MGEngineUITreeNode } from "@mge/mgengineui";

interface TextEditorServiceLike {
  openFile(path: string, options?: { activatePanel?: boolean }): void;
}

interface AssetTreeBranch {
  children: Map<string, AssetTreeBranch>;
  file?: {
    kind: string;
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
    const textEditor = ctx.services.has("text-editor")
      ? ctx.services.require<TextEditorServiceLike>("text-editor")
      : null;

    ui.panels.register({
      id: "assets",
      order: 1,
      render(uiService) {
        const editor = ctx.services.require<EditorService>("editor");
        const files = editor.getProjectFiles();
        const selectedPath = editor.getSelectedFilePath();
        const zone = uiService.panels.getZone("assets");
        const sideDocked = zone === "left" || zone === "right";
        const explorerMode = preferredMode === "explorer" || (preferredMode === "auto" && sideDocked);
        ensureAssetsStyles(document);
        const stack = document.createElement("div");
        stack.className = explorerMode ? "mge-stack mge-assets-panel is-explorer" : "mge-stack mge-assets-panel";

        const toolbar = document.createElement("div");
        toolbar.className = "mge-inline-actions";
        toolbar.append(
          uiService.button.create({
            label: "Auto",
            onClick: () => {
              preferredMode = "auto";
              uiService.invalidate();
            },
            variant: preferredMode === "auto" ? "accent" : "ghost"
          }),
          uiService.button.create({
            label: "Explorer",
            onClick: () => {
              preferredMode = "explorer";
              uiService.invalidate();
            },
            variant: preferredMode === "explorer" ? "accent" : "ghost"
          }),
          uiService.button.create({
            label: "Preview",
            onClick: () => {
              preferredMode = "preview";
              uiService.invalidate();
            },
            variant: preferredMode === "preview" ? "accent" : "ghost"
          })
        );
        stack.append(toolbar);

        stack.append(uiService.tree.render(buildAssetTree(files, selectedPath, editor, textEditor)));

        const selected = files.find((file) => file.path === selectedPath);

        if (selected && !explorerMode) {
          stack.append(
            uiService.propertyGrid.render([
              { kind: "text", label: "Path", readOnly: true, value: selected.path },
              { kind: "text", label: "Kind", readOnly: true, value: selected.kind },
              { kind: "textarea", label: "Preview", readOnly: true, value: selected.content }
            ])
          );
        }

        return stack;
      },
      title: "Assets",
      zone: "left"
    });
  }
};

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
        icon: isFile ? iconForFile(name) : "/>",
        label: name,
        onOpen: openFile,
        onSelect: isFile && filePath ? () => editor.selectFile(filePath) : undefined,
        selected: Boolean(filePath && filePath === selectedPath),
        trailing: isFile ? child.file?.kind : undefined
      } satisfies MGEngineUITreeNode;
    });
}

function normalizeAssetPath(path: string): string {
  return path.replace(/^\.\//, "");
}

function isEditableTextFile(path: string, kind: string): boolean {
  return (
    kind === "config" ||
    kind === "script" ||
    kind === "workspace" ||
    path.endsWith(".json") ||
    path.endsWith(".js") ||
    path.endsWith(".md") ||
    path.endsWith(".txt") ||
    path.endsWith(".ts")
  );
}

function iconForFile(path: string): string {
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
  `;
  documentRef.head.append(style);
}

export default editorAssetsModule;
