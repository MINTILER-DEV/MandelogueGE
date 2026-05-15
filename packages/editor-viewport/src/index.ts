import type { EditorService } from "@mge/editor-core";
import type { MGECModule } from "@mge/kernel";
import type { MGEngineUIService } from "@mge/mgengineui";
import type { Canvas2DRendererService } from "@mge/renderer-canvas2d";

const editorViewportModule: MGECModule = {
  id: "@mge/editor-viewport",

  setup(ctx) {
    const ui = ctx.services.require<MGEngineUIService>("mgengineui");
    const renderer = ctx.services.require<Canvas2DRendererService>("renderer");

    ui.panels.register({
      id: "viewport",
      order: 0,
      render() {
        const editor = ctx.services.require<EditorService>("editor");
        const canvas = ctx.services.require<HTMLCanvasElement>("host:viewport-canvas");
        const root = document.createElement("div");
        const toolbar = document.createElement("div");
        const stageFrame = document.createElement("div");
        const stage = document.createElement("div");
        const status = document.createElement("span");

        root.className = "mge-viewport-panel";
        toolbar.className = "mge-viewport-toolbar";
        stageFrame.className = editor.isPlaying()
          ? "mge-viewport-frame mge-viewport-frame--live"
          : "mge-viewport-frame";
        stage.className = editor.isPlaying()
          ? "mge-viewport-stage mge-viewport-stage--live"
          : "mge-viewport-stage mge-viewport-stage--preview";
        status.className = "mge-viewport-status";
        status.textContent = editor.isPlaying() ? "Runtime View" : "Preview 16:9";

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
          }),
          status
        );

        renderer.resetView();
        stage.append(canvas);
        stageFrame.append(stage);
        root.append(toolbar, stageFrame);
        return root;
      },
      title: "Viewport",
      zone: "center"
    });
  }
};

export default editorViewportModule;
