import type { MGECModule } from "@mge/kernel";
import { getRuntime, Transform, type ComponentFactory, type Runtime, type Scene } from "@mge/core";

export interface SceneService {
  create(name: string): Scene;
  getActive(): Scene;
  runtime: Runtime;
  setActive(scene: Scene): void;
}

const sceneModule: MGECModule = {
  id: "@mge/scene",

  setup(ctx) {
    const runtime = getRuntime(ctx);
    const initialScene = runtime.createScene(ctx.project.mainScene ?? "Main Scene");

    runtime.setActiveScene(initialScene);

    const sceneService: SceneService = {
      create(name: string) {
        return runtime.createScene(name);
      },
      getActive() {
        return runtime.getActiveScene();
      },
      runtime,
      setActive(scene) {
        runtime.setActiveScene(scene);
      }
    };

    ctx.extensions.register("mge:component-factory", {
      create: transformFromData,
      matches(component) {
        return component instanceof Transform;
      },
      serialize(component) {
        const transform = component as Transform;

        return {
          rotation: transform.rotation,
          scaleX: transform.scaleX,
          scaleY: transform.scaleY,
          x: transform.x,
          y: transform.y
        };
      },
      type: "Transform"
    } satisfies ComponentFactory);
    ctx.services.provide("scene", sceneService, ctx.component.id);
    ctx.log.info(`Created active scene "${initialScene.name}" and registered Transform.`);
  }
};

function transformFromData(data: Record<string, unknown> = {}): Transform {
  return new Transform({
    rotation: typeof data.rotation === "number" ? data.rotation : 0,
    scaleX: typeof data.scaleX === "number" ? data.scaleX : 1,
    scaleY: typeof data.scaleY === "number" ? data.scaleY : 1,
    x: typeof data.x === "number" ? data.x : 0,
    y: typeof data.y === "number" ? data.y : 0
  });
}

export default sceneModule;
