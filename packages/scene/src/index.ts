import type { MGECModule } from "@mge/kernel";
import { getRuntime, type Runtime, type Scene } from "@mge/core";

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

    ctx.services.provide("scene", sceneService, ctx.component.id);
    ctx.log.info(`Created active scene "${initialScene.name}".`);
  }
};

export default sceneModule;
