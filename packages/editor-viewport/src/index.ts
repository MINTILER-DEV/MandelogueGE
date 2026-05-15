import type { EditorService } from "@mge/editor-core";
import type { MGECModule } from "@mge/kernel";
import type { MGEngineUIService } from "@mge/mgengineui";

const editorViewportModule: MGECModule = {
  id: "@mge/editor-viewport",

  setup(ctx) {
    const ui = ctx.services.require<MGEngineUIService>("mgengineui");

    ui.panels.register({
      id: "viewport",
      order: 0,
      render() {
        const editor = ctx.services.require<EditorService>("editor");
        const canvas = ctx.services.require<HTMLCanvasElement>("host:viewport-canvas");
        const stack = document.createElement("div");
        stack.className = "mge-stack";

        const toolbar = document.createElement("div");
        toolbar.className = "mge-menu-row";
        toolbar.append(
          ui.button.create({
            label: editor.isPlaying() ? "Stop" : "Play",
            onClick: () => editor.togglePlay(),
            variant: "accent"
          }),
          ui.button.create({
            label: "Snapshot",
            onClick: () => editor.saveProject(),
            variant: "ghost"
          })
        );
        stack.append(toolbar);

        const frame = document.createElement("div");
        frame.style.background = "rgba(255,255,255,0.03)";
        frame.style.border = "1px solid rgba(255,255,255,0.08)";
        frame.style.borderRadius = "1rem";
        frame.style.minHeight = "24rem";
        frame.style.overflow = "hidden";
        frame.append(canvas);
        stack.append(frame);

        return stack;
      },
      title: "Viewport",
      zone: "center"
    });
  }
};

export default editorViewportModule;
