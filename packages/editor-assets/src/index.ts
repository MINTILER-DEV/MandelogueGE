import type { EditorService } from "@mge/editor-core";
import type { MGECModule } from "@mge/kernel";
import type { MGEngineUIService } from "@mge/mgengineui";

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

        stack.append(
          uiService.tree.render(
            files.map((file) => ({
              label: file.path,
              onSelect: () => editor.selectFile(file.path),
              selected: file.path === selectedPath,
              trailing: file.kind
            }))
          )
        );

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

export default editorAssetsModule;
