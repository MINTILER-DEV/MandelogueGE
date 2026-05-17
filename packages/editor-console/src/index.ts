import type { EditorService } from "@mge/editor-core";
import type { MGECModule } from "@mge/kernel";
import type { MGEngineUIService } from "@mge/mgengineui";

const editorConsoleModule: MGECModule = {
  id: "@mge/editor-console",

  setup(ctx) {
    let activeFilter: "all" | "editor" | "error" | "info" | "kernel" | "runtime" | "warn" = "all";
    const ui = ctx.services.require<MGEngineUIService>("mgengineui");

    ui.panels.register({
      id: "console",
      order: 0,
      render(uiService) {
        const editor = ctx.services.require<EditorService>("editor");
        const stack = document.createElement("div");
        stack.className = "mge-stack";
        const filters = document.createElement("div");
        filters.className = "mge-inline-actions";
        for (const option of ["all", "info", "warn", "error", "kernel", "runtime", "editor"] as const) {
          filters.append(
            uiService.button.create({
              label: option[0]?.toUpperCase() + option.slice(1),
              onClick: () => {
                activeFilter = option;
                uiService.invalidate();
              },
              variant: activeFilter === option ? "accent" : "ghost"
            })
          );
        }

        stack.append(
          filters,
          uiService.button.create({
            label: "Clear Logs",
            onClick: () => editor.clearLogs(),
            variant: "ghost"
          })
        );

        const logs = editor.getLogs().filter((entry) => matchesFilter(entry, activeFilter));

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

function matchesFilter(
  entry: ReturnType<EditorService["getLogs"]>[number],
  filter: "all" | "editor" | "error" | "info" | "kernel" | "runtime" | "warn"
): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "info" || filter === "warn" || filter === "error") {
    return entry.level === filter;
  }

  const source = entry.source.toLowerCase();

  if (filter === "editor") {
    return source === "editor" || source.includes("editor");
  }

  if (filter === "runtime") {
    return source.includes("runtime") || source.includes("renderer") || source.includes("scene");
  }

  return source === "kernel" || source.includes("kernel") || source.startsWith("@mge/");
}

export default editorConsoleModule;
