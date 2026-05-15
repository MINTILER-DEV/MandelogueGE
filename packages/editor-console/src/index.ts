import type { EditorService } from "@mge/editor-core";
import type { MGECModule } from "@mge/kernel";
import type { MGEngineUIService } from "@mge/mgengineui";

const editorConsoleModule: MGECModule = {
  id: "@mge/editor-console",

  setup(ctx) {
    const ui = ctx.services.require<MGEngineUIService>("mgengineui");

    ui.panels.register({
      id: "console",
      order: 0,
      render(uiService) {
        const editor = ctx.services.require<EditorService>("editor");
        const stack = document.createElement("div");
        stack.className = "mge-stack";
        stack.append(
          uiService.button.create({
            label: "Clear Logs",
            onClick: () => editor.clearLogs(),
            variant: "ghost"
          })
        );

        const logs = editor.getLogs();

        if (logs.length === 0) {
          const empty = document.createElement("p");
          empty.className = "mge-empty";
          empty.textContent = "No log output yet.";
          stack.append(empty);
          return stack;
        }

        for (const entry of logs) {
          const line = document.createElement("div");
          line.className = "mge-log-entry";
          const header = document.createElement("strong");
          header.textContent = `[${entry.level}] ${entry.source}`;
          const message = document.createElement("span");
          message.textContent = entry.message;
          const time = document.createElement("small");
          time.className = "mge-log-entry__meta";
          time.textContent = entry.time;
          line.append(header, message, time);
          stack.append(line);
        }

        return stack;
      },
      title: "Console",
      zone: "bottom"
    });
  }
};

export default editorConsoleModule;
