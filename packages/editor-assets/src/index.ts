import type { EditorService } from "@mge/editor-core";
import type { MGECModule } from "@mge/kernel";
import type { MGEngineUIService, MGEngineUITreeNode } from "@mge/mgengineui";

interface AssetTreeBranch {
  children: Map<string, AssetTreeBranch>;
  file?: {
    kind: string;
    path: string;
  };
  path: string;
}

const editorAssetsModule: MGECModule = {
  id: "@mge/editor-assets",

  setup(ctx) {
    const ui = ctx.services.require<MGEngineUIService>("mgengineui");

    ui.panels.register({
      id: "assets",
      order: 1,
      render(uiService) {
        const editor = ctx.services.require<EditorService>("editor");
        const files = editor.getProjectFiles();
        const selectedPath = editor.getSelectedFilePath();
        const stack = document.createElement("div");
        stack.className = "mge-stack";

        stack.append(uiService.tree.render(buildAssetTree(files, selectedPath, editor)));

        const selected = files.find((file) => file.path === selectedPath);

        if (selected) {
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
      zone: "bottom"
    });
  }
};

function buildAssetTree(
  files: ReturnType<EditorService["getProjectFiles"]>,
  selectedPath: string | null,
  editor: EditorService
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

  return materializeAssetNodes(root, selectedPath, editor);
}

function materializeAssetNodes(
  branch: AssetTreeBranch,
  selectedPath: string | null,
  editor: EditorService
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
      const childNodes = materializeAssetNodes(child, selectedPath, editor);
      const isFile = Boolean(child.file);
      const filePath = child.file?.path ?? null;

      return {
        children: childNodes.length > 0 ? childNodes : undefined,
        label: name,
        onSelect: isFile && filePath ? () => editor.selectFile(filePath) : undefined,
        selected: Boolean(filePath && filePath === selectedPath),
        trailing: isFile ? child.file?.kind : undefined
      } satisfies MGEngineUITreeNode;
    });
}

function normalizeAssetPath(path: string): string {
  return path.replace(/^\.\//, "");
}

export default editorAssetsModule;
