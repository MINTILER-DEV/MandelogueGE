import type { MGECModule } from "@mge/kernel";
import { getRuntime } from "@mge/core";

export interface CanvasHost {
  canvas: HTMLCanvasElement;
  clearColor?: string;
}

export interface CanvasViewTransform {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

export interface Canvas2DRendererService {
  beginFrame(): void;
  bounds(): { height: number; width: number };
  drawRect(x: number, y: number, width: number, height: number, color: string): void;
  getView(): CanvasViewTransform;
  resetView(): void;
  setView(nextView: Partial<CanvasViewTransform>): void;
}

function resolveCanvasHost(): CanvasHost {
  if (typeof document === "undefined") {
    throw new Error('No canvas host was found. Provide "host:canvas" when running outside the browser DOM.');
  }

  const canvas = document.querySelector<HTMLCanvasElement>("[data-mge-canvas]");

  if (!canvas) {
    throw new Error('Renderer could not find a canvas with the attribute "data-mge-canvas".');
  }

  return { canvas };
}

function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement): void {
  const pixelRatio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const displayWidth = Math.max(1, Math.floor(canvas.clientWidth * pixelRatio));
  const displayHeight = Math.max(1, Math.floor(canvas.clientHeight * pixelRatio));

  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
  }
}

const rendererCanvas2dModule: MGECModule = {
  id: "@mge/renderer-canvas2d",

  setup(ctx) {
    const runtime = getRuntime(ctx);
    const host = ctx.services.has("host:canvas")
      ? ctx.services.require<CanvasHost>("host:canvas")
      : resolveCanvasHost();
    const context2d = host.canvas.getContext("2d");

    if (!context2d) {
      throw new Error("Canvas2D context could not be created.");
    }

    const view: CanvasViewTransform = {
      offsetX: 0,
      offsetY: 0,
      zoom: 1
    };

    const renderer: Canvas2DRendererService = {
      beginFrame() {
        resizeCanvasToDisplaySize(host.canvas);
        context2d.setTransform(1, 0, 0, 1, 0, 0);
        context2d.clearRect(0, 0, host.canvas.width, host.canvas.height);
        context2d.fillStyle = host.clearColor ?? "#101418";
        context2d.fillRect(0, 0, host.canvas.width, host.canvas.height);
        context2d.setTransform(view.zoom, 0, 0, view.zoom, view.offsetX, view.offsetY);
      },
      bounds() {
        return {
          height: host.canvas.height,
          width: host.canvas.width
        };
      },
      drawRect(x, y, width, height, color) {
        context2d.fillStyle = color;
        context2d.fillRect(x, y, width, height);
      },
      getView() {
        return { ...view };
      },
      resetView() {
        view.offsetX = 0;
        view.offsetY = 0;
        view.zoom = 1;
      },
      setView(nextView) {
        if (typeof nextView.offsetX === "number") {
          view.offsetX = nextView.offsetX;
        }

        if (typeof nextView.offsetY === "number") {
          view.offsetY = nextView.offsetY;
        }

        if (typeof nextView.zoom === "number") {
          view.zoom = Math.max(0.1, Math.min(16, nextView.zoom));
        }
      }
    };

    ctx.services.provide("renderer", renderer, ctx.component.id);
    runtime.registerSystem({
      id: "@mge/renderer-canvas2d/begin-frame",
      phase: "render",
      priority: -1000,
      run() {
        renderer.beginFrame();
      }
    });
    ctx.log.info("Registered the Canvas2D renderer.");
  }
};

export default rendererCanvas2dModule;
