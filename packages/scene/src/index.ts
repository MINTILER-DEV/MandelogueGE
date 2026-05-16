import type { MGECModule } from "@mge/kernel";
import { getRuntime, type Runtime, type RuntimeComponentLike, type RuntimeFrameContext } from "@mge/runtime";

export class Component implements RuntimeComponentLike {
  entity!: Entity;
  #started = false;

  destroy(ctx: RuntimeFrameContext): void {
    void ctx;
  }

  get started(): boolean {
    return this.#started;
  }

  markStarted(): void {
    this.#started = true;
  }

  render(ctx: RuntimeFrameContext): void {
    void ctx;
  }

  start(ctx: RuntimeFrameContext): void {
    void ctx;
  }

  update(ctx: RuntimeFrameContext, dt: number): void {
    void ctx;
    void dt;
  }
}

export class Transform extends Component {
  rotation = 0;
  scaleX = 1;
  scaleY = 1;
  x = 0;
  y = 0;

  constructor(init?: Partial<Transform>) {
    super();
    Object.assign(this, init);
  }
}

export class Entity {
  readonly components: Component[] = [];
  readonly id: string;
  name: string;
  scene: Scene | null = null;

  constructor(name: string, id = nextId("entity")) {
    this.id = id;
    this.name = name;
  }

  addComponent<T extends Component>(component: T): T {
    component.entity = this;
    this.components.push(component);
    return component;
  }

  getComponent<T extends Component>(type: abstract new (...args: never[]) => T): T | undefined {
    return this.components.find((component) => component instanceof type) as T | undefined;
  }

  getComponents(): readonly Component[] {
    return this.components;
  }

  removeComponent(component: Component): void {
    const index = this.components.indexOf(component);

    if (index >= 0) {
      this.components.splice(index, 1);
    }
  }
}

export class Scene {
  readonly entities: Entity[] = [];
  readonly id: string;
  name: string;
  runtime: Runtime | null = null;

  constructor(name: string, id = nextId("scene")) {
    this.id = id;
    this.name = name;
  }

  addEntity(entity: Entity): Entity {
    entity.scene = this;
    this.entities.push(entity);
    return entity;
  }

  attachRuntime(runtime: Runtime): void {
    this.runtime = runtime;

    for (const entity of this.entities) {
      entity.scene = this;
    }
  }

  createEntity(name: string, id?: string): Entity {
    const entity = new Entity(name, id);
    return this.addEntity(entity);
  }

  getComponents<T extends Component>(type: abstract new (...args: never[]) => T): T[] {
    return this.entities.flatMap((entity) =>
      entity.components.filter((component) => component instanceof type) as T[]
    );
  }

  clear(): void {
    for (const entity of this.entities) {
      entity.scene = null;
    }

    this.entities.length = 0;
  }

  removeEntity(entity: Entity): void {
    const index = this.entities.indexOf(entity);

    if (index >= 0) {
      this.entities.splice(index, 1);
      entity.scene = null;
    }
  }
}

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
    const initialScene = new Scene(ctx.project.mainScene ?? "Main Scene");

    runtime.setActiveScene(initialScene);

    const sceneService: SceneService = {
      create(name: string) {
        return new Scene(name);
      },
      getActive() {
        return runtime.getActiveScene<Scene>();
      },
      runtime,
      setActive(scene) {
        runtime.setActiveScene(scene);
      }
    };

    ctx.extensions.register("mge:component-factory", {
      create: transformFromData,
      matches(component: unknown) {
        return component instanceof Transform;
      },
      serialize(component: unknown) {
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
    });
    ctx.services.provide("scene", sceneService, ctx.component.id);
    ctx.log.info(`Created active scene "${initialScene.name}" and registered Transform.`);
  }
};

let nextNumericId = 0;

function nextId(prefix: string): string {
  nextNumericId += 1;
  return `${prefix}:${nextNumericId}`;
}

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
