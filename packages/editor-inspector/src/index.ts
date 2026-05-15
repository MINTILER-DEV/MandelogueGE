import type { Component, Entity } from "@mge/core";
import type { EditorService } from "@mge/editor-core";
import type { ECSService } from "@mge/ecs";
import type { MGECModule } from "@mge/kernel";
import type { MGEngineUIPropertyRowDefinition, MGEngineUIService } from "@mge/mgengineui";
import type { ScriptComponent } from "@mge/scripting-ts";

interface ScriptPropertySyncService {
  updateScriptProperty(path: string, propertyName: string, value: boolean | number | string): boolean;
}

const editorInspectorModule: MGECModule = {
  id: "@mge/editor-inspector",

  setup(ctx) {
    const ecs = ctx.services.require<ECSService>("ecs");
    const ui = ctx.services.require<MGEngineUIService>("mgengineui");
    const textEditor = ctx.services.has("text-editor")
      ? ctx.services.require<ScriptPropertySyncService>("text-editor")
      : null;

    ui.panels.register({
      id: "inspector",
      order: 0,
      render(uiService) {
        const editor = ctx.services.require<EditorService>("editor");
        const entity = editor.getSelectedEntity();
        const stack = document.createElement("div");
        stack.className = "mge-stack";

        if (!entity) {
          const empty = document.createElement("p");
          empty.className = "mge-empty";
          empty.textContent = "Select an entity to inspect it.";
          stack.append(empty);
          return stack;
        }

        stack.append(renderEntityHeader(entity, editor, ecs, uiService));

        for (const component of entity.components) {
          const section = document.createElement("section");
          section.className = "mge-section mge-stack";

          const title = document.createElement("strong");
          title.textContent = component.constructor.name;
          section.append(title);
          section.append(uiService.propertyGrid.render(buildRows(component, editor, textEditor)));
          stack.append(section);
        }

        return stack;
      },
      title: "Inspector",
      zone: "right"
    });
  }
};

function buildRows(
  component: Component,
  editor: EditorService,
  textEditor: ScriptPropertySyncService | null
): MGEngineUIPropertyRowDefinition[] {
  const rows: MGEngineUIPropertyRowDefinition[] = [];

  for (const [key, value] of Object.entries(component)) {
    if (key === "entity") {
      continue;
    }

    if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
      rows.push({
        kind: typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "text",
        label: key,
        onChange(nextValue) {
          (component as unknown as Record<string, unknown>)[key] = nextValue;
          editor.refresh();
        },
        value
      });
      continue;
    }

    if (isRecord(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        if (
          typeof nestedValue === "number" ||
          typeof nestedValue === "string" ||
          typeof nestedValue === "boolean"
        ) {
          rows.push({
            kind:
              typeof nestedValue === "number" ? "number" : typeof nestedValue === "boolean" ? "boolean" : "text",
            label: `${key}.${nestedKey}`,
            onChange(nextValue) {
              value[nestedKey] = nextValue;
              const maybeScript = component as ScriptComponent & { instance?: Record<string, unknown> | null };

              if (maybeScript.instance && nestedKey in maybeScript.instance) {
                maybeScript.instance[nestedKey] = nextValue;
              }

              if (
                key === "properties" &&
                typeof maybeScript.script === "string" &&
                textEditor &&
                isScriptEditableValue(nextValue)
              ) {
                textEditor.updateScriptProperty(maybeScript.script, nestedKey, nextValue);
              }

              editor.refresh();
            },
            value: nestedValue
          });
        }
      }
    }
  }

  return rows;
}

function isRecord(value: unknown): value is Record<string, boolean | number | string> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isScriptEditableValue(value: unknown): value is boolean | number | string {
  return typeof value === "boolean" || typeof value === "number" || typeof value === "string";
}

function renderEntityHeader(
  entity: Entity,
  editor: EditorService,
  ecs: ECSService,
  ui: MGEngineUIService
): HTMLElement {
  const stack = document.createElement("div");
  stack.className = "mge-section mge-stack";
  stack.append(
    ui.propertyGrid.render([
      {
        kind: "text",
        label: "Entity",
        onChange(nextValue) {
          entity.name = String(nextValue);
          editor.refresh();
        },
        value: entity.name
      }
    ])
  );

  const actions = document.createElement("div");
  actions.className = "mge-inline-actions";
  actions.append(
    ui.button.create({
      label: "Add Component",
      onClick: () => {
        const availableTypes = ecs
          .listComponentFactories()
          .map((factory) => factory.type)
          .sort((left, right) => left.localeCompare(right));

        if (availableTypes.length === 0) {
          editor.log("warn", "No component factories are registered.", "@mge/editor-inspector");
          return;
        }

        ui.modal.open({
          render(modalUi) {
            const modalStack = document.createElement("div");
            modalStack.className = "mge-stack";
            const caption = document.createElement("p");
            caption.className = "mge-empty";
            caption.textContent = `Add a component to "${entity.name}".`;
            modalStack.append(caption);

            for (const componentType of availableTypes) {
              modalStack.append(
                modalUi.button.create({
                  label: componentType,
                  onClick: () => {
                    ecs.addComponent(entity, componentType);
                    editor.log("info", `Added ${componentType} to "${entity.name}".`, "@mge/editor-inspector");
                    modalUi.modal.close();
                    editor.refresh();
                  },
                  variant: "ghost"
                })
              );
            }

            return modalStack;
          },
          title: "Add Component"
        });
      }
    })
  );
  stack.append(actions);
  return stack;
}

export default editorInspectorModule;
