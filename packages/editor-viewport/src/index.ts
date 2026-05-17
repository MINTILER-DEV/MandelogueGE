import type { EditorService } from "@mge/editor-core";
import type { MGECModule } from "@mge/kernel";
import type { MGEngineUIService } from "@mge/mgengineui";
import type { Canvas2DRendererService } from "@mge/renderer-canvas2d";
import { Transform, type Entity } from "@mge/scene";
import type { SceneService } from "@mge/scene";

type ViewportTool = "move" | "pan" | "rotate" | "scale" | "select" | "zoom";

const VIEWPORT_STYLE_ID = "mge-editor-viewport-styles";

const editorViewportModule: MGECModule = {
  id: "@mge/editor-viewport",

  setup(ctx) {
    let activeTool: ViewportTool = "select";
    let showGrid = true;
    let boundCanvas: HTMLCanvasElement | null = null;
    let dragState:
      | {
          entity: Entity;
          offsetX: number;
          offsetY: number;
          pointerId: number;
          type: "entity";
        }
      | {
          pointerId: number;
          startOffsetX: number;
          startOffsetY: number;
          startPointerX: number;
          startPointerY: number;
          type: "pan";
        }
      | null = null;
    const ui = ctx.services.require<MGEngineUIService>("mgengineui");
    const renderer = ctx.services.require<Canvas2DRendererService>("renderer");

    ui.panels.register({
      id: "viewport",
      order: 0,
      render() {
        const editor = ctx.services.require<EditorService>("editor");
        const scene = ctx.services.require<SceneService>("scene");
        const canvas = ctx.services.require<HTMLCanvasElement>("host:viewport-canvas");
        ensureViewportStyles(document);
        bindCanvasInteractions(canvas, editor, scene, renderer);
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
          : `mge-viewport-stage mge-viewport-stage--preview${showGrid ? " mge-viewport-stage--grid" : ""}`;
        status.className = "mge-viewport-status";
        status.textContent = editor.isPlaying() ? `Runtime View - ${activeTool}` : `Preview 16:9 - ${activeTool}`;

        toolbar.append(
          ...createToolButtons(ui, activeTool, (tool) => {
            activeTool = tool;
            ui.invalidate();
          }),
          ui.button.create({
            label: editor.isPlaying() ? "Stop" : "Play",
            onClick: () => editor.togglePlay(),
            variant: "accent"
          }),
          ui.button.create({
            label: showGrid ? "Grid On" : "Grid Off",
            onClick: () => {
              showGrid = !showGrid;
              ui.invalidate();
            },
            variant: showGrid ? "ghost" : "subtle"
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

    function bindCanvasInteractions(
      canvas: HTMLCanvasElement,
      editor: EditorService,
      scene: SceneService,
      viewportRenderer: Canvas2DRendererService
    ): void {
      if (boundCanvas === canvas) {
        return;
      }

      boundCanvas = canvas;

      canvas.addEventListener("pointerdown", (event) => {
        const worldPoint = toWorldPoint(event, canvas, viewportRenderer);
        const hit = hitTestEntity(scene.getActive().entities, worldPoint.x, worldPoint.y);

        if (activeTool === "pan") {
          const view = viewportRenderer.getView();
          dragState = {
            pointerId: event.pointerId,
            startOffsetX: view.offsetX,
            startOffsetY: view.offsetY,
            startPointerX: event.clientX,
            startPointerY: event.clientY,
            type: "pan"
          };
          canvas.setPointerCapture(event.pointerId);
          return;
        }

        if (!hit) {
          return;
        }

        editor.selectEntity(hit.entity);

        if (activeTool === "select" || activeTool === "move") {
          dragState = {
            entity: hit.entity,
            offsetX: worldPoint.x - hit.transform.x,
            offsetY: worldPoint.y - hit.transform.y,
            pointerId: event.pointerId,
            type: "entity"
          };
          canvas.setPointerCapture(event.pointerId);
        }
      });

      canvas.addEventListener("pointermove", (event) => {
        if (!dragState || dragState.pointerId !== event.pointerId) {
          return;
        }

        if (dragState.type === "pan") {
          viewportRenderer.setView({
            offsetX: dragState.startOffsetX + (event.clientX - dragState.startPointerX),
            offsetY: dragState.startOffsetY + (event.clientY - dragState.startPointerY)
          });
          editor.refresh();
          return;
        }

        const transform = dragState.entity.getComponent(Transform);

        if (!transform) {
          return;
        }

        const worldPoint = toWorldPoint(event, canvas, viewportRenderer);
        transform.x = Math.round(worldPoint.x - dragState.offsetX);
        transform.y = Math.round(worldPoint.y - dragState.offsetY);
        editor.refresh();
      });

      const releaseDrag = (event: PointerEvent) => {
        if (!dragState || dragState.pointerId !== event.pointerId) {
          return;
        }

        dragState = null;
        canvas.releasePointerCapture(event.pointerId);
      };

      canvas.addEventListener("pointerup", releaseDrag);
      canvas.addEventListener("pointercancel", releaseDrag);
      canvas.addEventListener("pointerleave", releaseDrag);
    }
  }
};

function createToolButtons(
  ui: MGEngineUIService,
  activeTool: ViewportTool,
  onSelect: (tool: ViewportTool) => void
): HTMLButtonElement[] {
  const tools: Array<{ label: string; tool: ViewportTool }> = [
    { label: "Select", tool: "select" },
    { label: "Move", tool: "move" },
    { label: "Scale", tool: "scale" },
    { label: "Rotate", tool: "rotate" },
    { label: "Pan", tool: "pan" },
    { label: "Zoom", tool: "zoom" }
  ];

  return tools.map(({ label, tool }) =>
    ui.button.create({
      label,
      onClick: () => onSelect(tool),
      variant: activeTool === tool ? "accent" : "ghost"
    })
  );
}

function hitTestEntity(
  entities: readonly Entity[],
  worldX: number,
  worldY: number
): { entity: Entity; transform: Transform } | null {
  for (const entity of [...entities].reverse()) {
    const transform = entity.getComponent(Transform);

    if (!transform) {
      continue;
    }

    const bounds = entity.components
      .map((component) => {
        const record = component as unknown as Record<string, unknown>;
        return typeof record.width === "number" && typeof record.height === "number"
          ? { height: record.height, width: record.width }
          : null;
      })
      .find(Boolean);

    if (!bounds) {
      continue;
    }

    if (
      worldX >= transform.x &&
      worldX <= transform.x + bounds.width &&
      worldY >= transform.y &&
      worldY <= transform.y + bounds.height
    ) {
      return { entity, transform };
    }
  }

  return null;
}

function toWorldPoint(
  event: PointerEvent,
  canvas: HTMLCanvasElement,
  renderer: Canvas2DRendererService
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const bounds = renderer.bounds();
  const view = renderer.getView();
  const canvasX = ((event.clientX - rect.left) / rect.width) * bounds.width;
  const canvasY = ((event.clientY - rect.top) / rect.height) * bounds.height;

  return {
    x: (canvasX - view.offsetX) / view.zoom,
    y: (canvasY - view.offsetY) / view.zoom
  };
}

function ensureViewportStyles(documentRef: Document): void {
  if (documentRef.getElementById(VIEWPORT_STYLE_ID)) {
    return;
  }

  const style = documentRef.createElement("style");
  style.id = VIEWPORT_STYLE_ID;
  style.textContent = `
    .mge-viewport-stage--grid {
      background-image:
        linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
      background-position: center center;
      background-size: 24px 24px;
    }
  `;
  documentRef.head.append(style);
}

export default editorViewportModule;
