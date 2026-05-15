import type { EditorService } from "@mge/editor-core";
import type { MGECModule } from "@mge/kernel";
import type { MGEngineUIService } from "@mge/mgengineui";
import type { SceneService } from "@mge/scene";

const editorHierarchyModule: MGECModule = {
  id: "@mge/editor-hierarchy",

  setup(ctx) {
    const ui = ctx.services.require<MGEngineUIService>("mgengineui");

    ui.panels.register({
      id: "hierarchy",
      order: 0,
      render(uiService) {
        const editor = ctx.services.require<EditorService>("editor");
        const scene = ctx.services.require<SceneService>("scene").getActive();
        const stack = document.createElement("div");
        stack.className = "mge-stack";
        stack.append(
          uiService.button.create({
            label: "Add Entity",
            onClick: () => editor.addEntity(),
            variant: "accent"
          })
        );
        stack.append(
          uiService.tree.render(
            scene.entities.map((entity) => ({
              label: entity.name,
              onSelect: () => editor.selectEntity(entity),
              selected: editor.getSelectedEntity() === entity,
              trailing: `${entity.components.length} component${entity.components.length === 1 ? "" : "s"}`
            }))
          )
        );
        return stack;
      },
      title: "Hierarchy",
      zone: "left"
    });
  }
};

export default editorHierarchyModule;
