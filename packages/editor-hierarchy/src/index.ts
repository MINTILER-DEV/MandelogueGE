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
        const actions = document.createElement("div");
        actions.className = "mge-inline-actions";
        actions.append(
          uiService.button.create({
            label: "Add Entity",
            onClick: () => editor.addEntity(),
            variant: "accent"
          }),
          uiService.button.create({
            label: "Delete Entity",
            onClick: () => {
              const selectedEntity = editor.getSelectedEntity();

              if (!selectedEntity) {
                return;
              }

              if (editor.deleteEntity(selectedEntity)) {
                editor.log("info", `Deleted entity "${selectedEntity.name}".`, "@mge/editor-hierarchy");
              }
            },
            variant: "ghost"
          })
        );
        stack.append(actions);
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
