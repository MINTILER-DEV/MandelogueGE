import type { MGECModule } from "@mge/kernel";
import type { Component, ComponentFactory, Entity, RuntimeSystem, Scene } from "@mge/core";

export interface ECSService {
  createComponent(type: string, data?: Record<string, unknown>): Component;
  createEntity(name: string, scene?: Scene): Entity;
  query<T extends Component>(type: abstract new (...args: never[]) => T, scene?: Scene): T[];
  registerComponentFactory(factory: ComponentFactory): void;
  registerSystem(system: RuntimeSystem): void;
}

const ecsModule: MGECModule = {
  id: "@mge/ecs",

  setup(ctx) {
    const sceneService = ctx.services.require<{
      getActive(): Scene;
      runtime: { registerSystem(system: RuntimeSystem): void };
    }>("scene");

    const ecs: ECSService = {
      createComponent(type, data = {}) {
        const factory = ctx.extensions
          .get<ComponentFactory>("mge:component-factory")
          .find((candidate) => candidate.type === type);

        if (!factory) {
          throw new Error(`No component factory is registered for type "${type}".`);
        }

        return factory.create(data);
      },
      createEntity(name, scene = sceneService.getActive()) {
        return scene.createEntity(name);
      },
      query(type, scene = sceneService.getActive()) {
        return scene.getComponents(type);
      },
      registerComponentFactory(factory) {
        ctx.extensions.register("mge:component-factory", factory);
      },
      registerSystem(system) {
        sceneService.runtime.registerSystem(system);
      }
    };

    ctx.services.provide("ecs", ecs, ctx.component.id);
    ctx.log.info("Registered the ECS service.");
  }
};

export default ecsModule;
