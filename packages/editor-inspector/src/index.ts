import type { Component, Entity } from "@mge/core";
import type { EditorProjectFile, EditorService } from "@mge/editor-core";
import type { ECSService } from "@mge/ecs";
import type { MGECModule } from "@mge/kernel";
import type { MGEngineUIPropertyRowDefinition, MGEngineUIService } from "@mge/mgengineui";
import type { ScriptComponent } from "@mge/scripting-ts";

interface ScriptPropertySyncService {
  createScript(path?: string): EditorProjectFile | null;
  getScriptEditableValues(path: string): Record<string, boolean | number | string>;
  updateScriptProperty(path: string, propertyName: string, value: boolean | number | string): boolean;
}

const editorInspectorModule: MGECModule = {
  id: "@mge/editor-inspector",

  setup(ctx) {
    const ecs = ctx.services.require<ECSService>("ecs");
    const ui = ctx.services.require<MGEngineUIService>("mgengineui");

    ui.panels.register({
      id: "inspector",
      order: 0,
      render(uiService) {
        const editor = ctx.services.require<EditorService>("editor");
        const textEditor = ctx.services.has("text-editor")
          ? ctx.services.require<ScriptPropertySyncService>("text-editor")
          : null;
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

        stack.append(renderEntityHeader(entity, editor, ecs, uiService, textEditor));

        for (const component of entity.components) {
          const section = document.createElement("section");
          section.className = "mge-section mge-stack";
          const header = document.createElement("div");
          header.className = "mge-inline-actions";

          const title = document.createElement("strong");
          title.textContent = component.constructor.name;
          header.append(title);
          header.append(
            uiService.button.create({
              label: "Delete Component",
              onClick: () => {
                if (editor.deleteComponent(entity, component)) {
                  editor.log(
                    "info",
                    `Removed ${component.constructor.name} from "${entity.name}".`,
                    "@mge/editor-inspector"
                  );
                }
              },
              variant: "ghost"
            })
          );
          section.append(header);
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
  ui: MGEngineUIService,
  textEditor: ScriptPropertySyncService | null
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
                    addComponentForType({
                      componentType,
                      ecs,
                      editor,
                      entity,
                      modalUi,
                      textEditor
                    });
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
    }),
    ui.button.create({
      label: "Delete Entity",
      onClick: () => {
        if (editor.deleteEntity(entity)) {
          editor.log("info", `Deleted entity "${entity.name}".`, "@mge/editor-inspector");
        }
      },
      variant: "ghost"
    })
  );
  stack.append(actions);
  return stack;
}

function addComponentForType(options: {
  componentType: string;
  ecs: ECSService;
  editor: EditorService;
  entity: Entity;
  modalUi: MGEngineUIService;
  textEditor: ScriptPropertySyncService | null;
}): void {
  const { componentType, ecs, editor, entity, modalUi, textEditor } = options;

  if (componentType !== "Script") {
    modalUi.modal.close();
    ecs.addComponent(entity, componentType);
    editor.log("info", `Added ${componentType} to "${entity.name}".`, "@mge/editor-inspector");
    editor.refresh();
    return;
  }

  const scriptFiles = listScriptFiles(editor);

  if (scriptFiles.length === 0) {
    const created = createDefaultScriptFile(editor, entity, textEditor);
    modalUi.modal.close();
    ecs.addComponent(entity, "Script", {
      properties: created.properties,
      script: created.path
    });
    editor.log("info", `Added Script to "${entity.name}" using "${created.path}".`, "@mge/editor-inspector");
    editor.refresh();
    return;
  }

  modalUi.modal.open({
    render(nextModalUi) {
      const modalStack = document.createElement("div");
      modalStack.className = "mge-stack";

      const caption = document.createElement("p");
      caption.className = "mge-empty";
      caption.textContent = `Choose a script for "${entity.name}".`;
      modalStack.append(caption);

      for (const scriptPath of scriptFiles) {
        modalStack.append(
          nextModalUi.button.create({
            label: scriptPath,
            onClick: () => {
              const properties = textEditor?.getScriptEditableValues(scriptPath) ?? {};
              nextModalUi.modal.close();
              ecs.addComponent(entity, "Script", {
                properties,
                script: scriptPath
              });
              editor.log("info", `Added Script to "${entity.name}" using "${scriptPath}".`, "@mge/editor-inspector");
              editor.refresh();
            },
            variant: "ghost"
          })
        );
      }

      modalStack.append(
        nextModalUi.button.create({
          label: "New Script File",
          onClick: () => {
            const created = createDefaultScriptFile(editor, entity, textEditor);
            nextModalUi.modal.close();
            ecs.addComponent(entity, "Script", {
              properties: created.properties,
              script: created.path
            });
            editor.log("info", `Added Script to "${entity.name}" using "${created.path}".`, "@mge/editor-inspector");
            editor.refresh();
          },
          variant: "accent"
        })
      );

      return modalStack;
    },
    title: "Choose Script"
  });
}

function listScriptFiles(editor: EditorService): string[] {
  return editor
    .getProjectFiles()
    .filter((file) => file.kind === "script" || isScriptPath(file.path))
    .map((file) => file.path)
    .sort((left, right) => left.localeCompare(right));
}

function createDefaultScriptFile(
  editor: EditorService,
  entity: Entity,
  textEditor: ScriptPropertySyncService | null
): {
  path: string;
  properties: Record<string, boolean | number | string>;
} {
  const className = toScriptClassName(entity.name);
  const path = nextScriptPath(editor, className);
  const created = textEditor?.createScript(path);

  if (!created) {
    const source = createScriptTemplate(className);
    editor.updateProjectFile(path, source, {
      kind: "script",
      select: true
    });
  }

  return {
    path,
    properties: textEditor?.getScriptEditableValues(path) ?? {}
  };
}

function nextScriptPath(editor: EditorService, className: string): string {
  const baseName = className || "NewScript";
  let index = 1;
  let candidate = `./scripts/${baseName}.ts`;

  while (editor.getProjectFile(candidate)) {
    index += 1;
    candidate = `./scripts/${baseName}${index}.ts`;
  }

  return candidate;
}

function createScriptTemplate(className: string): string {
  return [
    'import { Script } from "@mge/core";',
    "",
    `export default class ${className} extends Script {`,
    "  speed = 220;",
    "",
    "  override update(dt: number): void {",
    "    if (this.input.keyDown(\"KeyD\")) {",
    "      this.transform.x += this.speed * dt;",
    "    }",
    "  }",
    "}",
    ""
  ].join("\n");
}

function toScriptClassName(name: string): string {
  const sanitized = name
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join("");

  return sanitized.endsWith("Controller") ? sanitized : `${sanitized || "New"}Controller`;
}

function isScriptPath(path: string): boolean {
  return path.endsWith(".ts") || path.endsWith(".mgescript.ts");
}

export default editorInspectorModule;
