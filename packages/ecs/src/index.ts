import type { MGECModule } from "@mge/kernel";
import type { Component, ComponentFactory, Entity, RuntimeSystem, Scene } from "@mge/core";

export interface SerializedComponentData {
  data: Record<string, unknown>;
  type: string;
}

export interface SerializedEntityData {
  components: SerializedComponentData[];
  id: string;
  name: string;
}

export interface SerializedSceneData {
  entities: SerializedEntityData[];
  id: string;
  name: string;
}

export interface ECSService {
  addComponent(entity: Entity, type: string, data?: Record<string, unknown>): Component;
  createComponent(type: string, data?: Record<string, unknown>): Component;
  createEntity(name: string, scene?: Scene): Entity;
  listComponentFactories(): ComponentFactory[];
  query<T extends Component>(type: abstract new (...args: never[]) => T, scene?: Scene): T[];
  registerComponentFactory(factory: ComponentFactory): void;
  registerSystem(system: RuntimeSystem): void;
  restoreScene(snapshot: SerializedSceneData, scene?: Scene): Scene;
  serializeComponent(component: Component): SerializedComponentData;
  snapshotScene(scene?: Scene): SerializedSceneData;
}

const ecsModule: MGECModule = {
  id: "@mge/ecs",

  setup(ctx) {
    const sceneService = ctx.services.require<{
      getActive(): Scene;
      runtime: { registerSystem(system: RuntimeSystem): void };
    }>("scene");

    const ecs: ECSService = {
      addComponent(entity, type, data = {}) {
        return entity.addComponent(ecs.createComponent(type, data));
      },
      createComponent(type, data = {}) {
        const factory = ecs.listComponentFactories().find((candidate) => candidate.type === type);

        if (!factory) {
          throw new Error(`No component factory is registered for type "${type}".`);
        }

        return factory.create(data);
      },
      createEntity(name, scene = sceneService.getActive()) {
        return scene.createEntity(name);
      },
      listComponentFactories() {
        return ctx.extensions.get<ComponentFactory>("mge:component-factory");
      },
      query(type, scene = sceneService.getActive()) {
        return scene.getComponents(type);
      },
      registerComponentFactory(factory) {
        ctx.extensions.register("mge:component-factory", factory);
      },
      registerSystem(system) {
        sceneService.runtime.registerSystem(system);
      },
      restoreScene(snapshot, scene = sceneService.getActive()) {
        scene.clear();

        for (const entityData of snapshot.entities) {
          const entity = scene.createEntity(entityData.name, entityData.id);

          for (const componentData of entityData.components) {
            ecs.addComponent(entity, componentData.type, componentData.data);
          }
        }

        return scene;
      },
      serializeComponent(component) {
        const factory = ecs
          .listComponentFactories()
          .find((candidate) => candidate.matches?.(component) ?? candidate.type === component.constructor.name);

        if (!factory) {
          throw new Error(`No component factory is registered for component "${component.constructor.name}".`);
        }

        return {
          data: factory.serialize ? factory.serialize(component) : fallbackSerialize(component),
          type: factory.type
        };
      },
      snapshotScene(scene = sceneService.getActive()) {
        return {
          entities: scene.entities.map((entity) => ({
            components: entity.components.map((component) => ecs.serializeComponent(component)),
            id: entity.id,
            name: entity.name
          })),
          id: scene.id,
          name: scene.name
        };
      }
    };

    ctx.services.provide("ecs", ecs, ctx.component.id);
    ctx.log.info("Registered the ECS service.");
  }
};

function fallbackSerialize(component: Component): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(component).filter(([key, value]) => key !== "entity" && typeof value !== "function")
  );
}

export default ecsModule;
