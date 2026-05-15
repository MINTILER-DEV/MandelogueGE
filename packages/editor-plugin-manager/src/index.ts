import type { EditorService } from "@mge/editor-core";
import type { MGECManifest, MGECModule, MGEProjectManifest } from "@mge/kernel";
import type { MGEngineUIService } from "@mge/mgengineui";

const PROJECT_FILE_PATH = ".mgeproject.json";
const PANEL_ID = "plugin-manager";

const editorPluginManagerModule: MGECModule = {
  id: "@mge/editor-plugin-manager",

  setup(ctx) {
    const ui = ctx.services.require<MGEngineUIService>("mgengineui");

    ui.commands.register({
      id: "editor-plugin-manager.focus",
      keybinding: "Ctrl+Shift+M",
      run: () => ui.panels.setActive(PANEL_ID),
      title: "Focus Plugin Manager"
    });

    ui.panels.register({
      id: PANEL_ID,
      order: 2,
      render(uiService) {
        const editor = ctx.services.require<EditorService>("editor");
        const available = ctx.services.has("host:workspace-component-manifests")
          ? ctx.services.require<MGECManifest[]>("host:workspace-component-manifests")
          : [];
        const stack = document.createElement("div");
        stack.className = "mge-stack";

        const note = document.createElement("p");
        note.className = "mge-empty";
        note.textContent = "Changes update .mgeproject.json immediately. Reload the editor to apply component graph changes.";
        stack.append(note);

        const project = readProjectManifest(editor);

        for (const manifest of available.filter((candidate) => candidate.targets.includes("editor")).sort(compareManifest)) {
          const section = document.createElement("section");
          section.className = "mge-section mge-stack";

          const header = document.createElement("div");
          header.className = "mge-inline-actions";

          const title = document.createElement("strong");
          title.textContent = manifest.name;
          header.append(title);

          const state = document.createElement("span");
          state.className = "mge-empty";
          const enabled = manifest.id in project.components;
          state.textContent = enabled ? "Enabled" : "Available";
          header.append(state);
          section.append(header);

          const details = document.createElement("div");
          details.className = "mge-stack";
          details.append(
            renderDetail("Id", manifest.id),
            renderDetail("Version", manifest.version),
            renderDetail("Targets", manifest.targets.join(", ")),
            renderDetail(
              "Features",
              manifest.providesFeatures && manifest.providesFeatures.length > 0
                ? manifest.providesFeatures.join(", ")
                : "None"
            )
          );
          section.append(details);

          section.append(
            uiService.button.create({
              label: enabled ? "Disable" : "Enable",
              onClick: () => {
                const nextProject = structuredClone(project);

                if (enabled) {
                  delete nextProject.components[manifest.id];
                } else {
                  nextProject.components[manifest.id] = `^${manifest.version}`;
                }

                editor.updateProjectFile(PROJECT_FILE_PATH, `${JSON.stringify(nextProject, null, 2)}\n`, {
                  kind: "config",
                  select: false
                });
                editor.saveProject();
                editor.log(
                  "info",
                  `${enabled ? "Disabled" : "Enabled"} ${manifest.id}. Reload the editor to apply the change.`,
                  "@mge/editor-plugin-manager"
                );
                editor.refresh();
              },
              variant: enabled ? "ghost" : "accent"
            })
          );

          stack.append(section);
        }

        return stack;
      },
      title: "Plugins",
      zone: "left"
    });
  }
};

function compareManifest(left: MGECManifest, right: MGECManifest): number {
  const leftEnabled = left.id.startsWith("@mge/editor-") ? 0 : 1;
  const rightEnabled = right.id.startsWith("@mge/editor-") ? 0 : 1;

  if (leftEnabled !== rightEnabled) {
    return leftEnabled - rightEnabled;
  }

  return left.name.localeCompare(right.name);
}

function readProjectManifest(editor: EditorService): MGEProjectManifest {
  const file = editor.getProjectFile(PROJECT_FILE_PATH);

  if (!file) {
    throw new Error(`Editor project file "${PROJECT_FILE_PATH}" is missing.`);
  }

  return JSON.parse(file.content) as MGEProjectManifest;
}

function renderDetail(label: string, value: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "mge-property-row";

  const name = document.createElement("span");
  name.className = "mge-property-row__label";
  name.textContent = label;
  row.append(name);

  const content = document.createElement("span");
  content.textContent = value;
  row.append(content);
  return row;
}

export default editorPluginManagerModule;
