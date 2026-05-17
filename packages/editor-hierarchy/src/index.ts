import type { EntityTemplateDefinition } from "@mge/core";
import type { EditorService } from "@mge/editor-core";
import type { ECSService } from "@mge/ecs";
import type { MGECModule } from "@mge/kernel";
import type { MGEngineUIService } from "@mge/mgengineui";
import type { Component, SceneService } from "@mge/scene";

const editorHierarchyModule: MGECModule = {
  id: "@mge/editor-hierarchy",

  setup(ctx) {
    const ui = ctx.services.require<MGEngineUIService>("mgengineui");

    ui.panels.register({
      id: "hierarchy",
      order: 0,
      render(uiService) {
        const editor = ctx.services.require<EditorService>("editor");
        const ecs = ctx.services.require<ECSService>("ecs");
        const scene = ctx.services.require<SceneService>("scene").getActive();
        const templates = ctx.extensions
          .get<EntityTemplateDefinition>("mge:create-entity-template")
          .sort((left, right) => left.label.localeCompare(right.label));
        const stack = document.createElement("div");
        stack.className = "mge-stack";
        const actions = document.createElement("div");
        actions.className = "mge-inline-actions";
        actions.append(
          uiService.button.create({
            label: "Add Entity",
            onClick: () => {
              uiService.modal.open({
                render(modalUi) {
                  const modalStack = document.createElement("div");
                  modalStack.className = "mge-stack";

                  for (const template of templates) {
                    modalStack.append(
                      modalUi.button.create({
                        label: template.label,
                        onClick: () => {
                          const entity = template.create({
                            name: template.label,
                            scene,
                            services: ctx.services
                          });
                          modalUi.modal.close();
                          editor.selectEntity(entity);
                          editor.log("info", `Created ${template.label} "${entity.name}".`, "@mge/editor-hierarchy");
                          editor.refresh();
                        },
                        variant: "ghost"
                      })
                    );
                  }

                  return modalStack;
                },
                title: "Add Entity"
              });
            },
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
              iconClass: iconForEntity(entity, ecs),
              label: entity.name,
              onSelect: () => editor.selectEntity(entity),
              selected: editor.getSelectedEntity() === entity,
              trailing: String(entity.components.length)
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

function iconForEntity(entity: { components: Component[] }, ecs: ECSService): string {
  const decorated = [...entity.components]
    .map((component) =>
      ecs
        .listComponentFactories()
        .find((factory) => factory.matches?.(component) ?? factory.type === component.constructor.name)
    )
    .find((factory) => factory?.icon && factory.type !== "Transform");

  return decorated?.icon ?? "codicon codicon-symbol-class";
}

export default editorHierarchyModule;
