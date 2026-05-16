import type { MGECModule, MGEKernelContext, ServiceRegistry } from "@mge/kernel";

export type SystemPhase = "fixed" | "update" | "render";

export interface RuntimeFrameDriver {
  cancelAnimationFrame(handle: number): void;
  now(): number;
  requestAnimationFrame(callback: (timestampMs: number) => void): number;
}

export interface RuntimeFrameContext {
  dt: number;
  elapsed: number;
  frame: number;
  runtime: Runtime;
  scene: Scene;
  services: ServiceRegistry;
}

export interface RuntimeSystem {
  id: string;
  phase: SystemPhase;
  priority?: number;
  run(ctx: RuntimeFrameContext, dt: number): void;
}

export interface KeyboardInputLike {
  keyDown(code: string): boolean;
}

export interface ComponentFactory {
  create(data?: Record<string, unknown>): Component;
  displayName?: string;
  matches?(component: Component): boolean;
  serialize?(component: Component): Record<string, unknown>;
  type: string;
}

export class Component {
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

export class Script {
  entity!: Entity;
  #frameContext: RuntimeFrameContext | null = null;

  attach(entity: Entity): void {
    this.entity = entity;
  }

  destroy(): void {}

  get input(): KeyboardInputLike {
    return this.requireService<KeyboardInputLike>("input");
  }

  get runtime(): Runtime {
    return this.frameContext.runtime;
  }

  get scene(): Scene {
    return this.frameContext.scene;
  }

  get services(): ServiceRegistry {
    return this.frameContext.services;
  }

  get time(): { delta: number; elapsed: number; frame: number; scale: number } {
    return this.requireService<{ delta: number; elapsed: number; frame: number; scale: number }>("time");
  }

  get transform(): Transform {
    const transform = this.entity.getComponent(Transform);

    if (!transform) {
      throw new Error(`Script "${this.constructor.name}" requires a Transform component on entity "${this.entity.name}".`);
    }

    return transform;
  }

  requireService<T>(id: string): T {
    return this.frameContext.services.require<T>(id);
  }

  render(): void {}

  setFrameContext(frameContext: RuntimeFrameContext): void {
    this.#frameContext = frameContext;
  }

  start(): void {}

  update(_dt: number): void {
    void _dt;
  }

  protected get frameContext(): RuntimeFrameContext {
    if (!this.#frameContext) {
      throw new Error(`Script "${this.constructor.name}" has not been bound to a runtime frame yet.`);
    }

    return this.#frameContext;
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

export interface RuntimeService {
  readonly services: ServiceRegistry;
  createScene(name: string, id?: string): Scene;
  getActiveScene(): Scene;
  getScene(): Scene | null;
  isDisposed(): boolean;
  isRunning(): boolean;
  registerSystem(system: RuntimeSystem): void;
  setActiveScene(scene: Scene): void;
  startLoop(): void;
  dispose(): void;
  stopLoop(): void;
  tick(timestampMs?: number): void;
}

export class Runtime implements RuntimeService {
  readonly #frameDriver: RuntimeFrameDriver;
  readonly #services: ServiceRegistry;
  readonly #systems: RuntimeSystem[] = [];
  #activeScene: Scene | null = null;
  #animationHandle: number | null = null;
  #disposed = false;
  #elapsed = 0;
  #frame = 0;
  #lastTimestampMs: number | null = null;
  #running = false;

  constructor(services: ServiceRegistry, frameDriver: RuntimeFrameDriver) {
    this.#services = services;
    this.#frameDriver = frameDriver;
  }

  get services(): ServiceRegistry {
    return this.#services;
  }

  createScene(name: string, id?: string): Scene {
    return new Scene(name, id);
  }

  getActiveScene(): Scene {
    if (!this.#activeScene) {
      throw new Error("No active scene has been set.");
    }

    return this.#activeScene;
  }

  getScene(): Scene | null {
    return this.#activeScene;
  }

  isDisposed(): boolean {
    return this.#disposed;
  }

  isRunning(): boolean {
    return this.#running;
  }

  registerSystem(system: RuntimeSystem): void {
    this.#systems.push(system);
    this.#systems.sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0));
  }

  setActiveScene(scene: Scene): void {
    scene.attachRuntime(this);
    this.#activeScene = scene;
  }

  startLoop(): void {
    if (this.#disposed || this.#running) {
      return;
    }

    this.#running = true;

    const schedule = () => {
      this.#animationHandle = this.#frameDriver.requestAnimationFrame((timestampMs) => {
        this.#animationHandle = null;
        this.tick(timestampMs);

        if (this.#running && !this.#disposed) {
          schedule();
        }
      });
    };

    schedule();
  }

  stopLoop(): void {
    this.#running = false;

    if (this.#animationHandle !== null) {
      this.#frameDriver.cancelAnimationFrame(this.#animationHandle);
      this.#animationHandle = null;
    }
  }

  dispose(): void {
    this.stopLoop();
    this.#disposed = true;
  }

  tick(timestampMs = this.#frameDriver.now()): void {
    if (this.#disposed) {
      return;
    }

    const scene = this.#activeScene;

    if (!scene) {
      return;
    }

    const deltaSeconds = this.#lastTimestampMs === null ? 1 / 60 : Math.min((timestampMs - this.#lastTimestampMs) / 1000, 0.1);
    this.#lastTimestampMs = timestampMs;
    this.#frame += 1;
    this.#elapsed += deltaSeconds;

    const frameContext: RuntimeFrameContext = {
      dt: deltaSeconds,
      elapsed: this.#elapsed,
      frame: this.#frame,
      runtime: this,
      scene,
      services: this.#services
    };

    this.#startPendingComponents(frameContext);
    this.#runSystems("fixed", frameContext, deltaSeconds);
    this.#runSystems("update", frameContext, deltaSeconds);

    for (const component of this.#iterateComponents(scene)) {
      component.update(frameContext, deltaSeconds);
    }

    this.#runSystems("render", frameContext, deltaSeconds);

    for (const component of this.#iterateComponents(scene)) {
      component.render(frameContext);
    }
  }

  #iterateComponents(scene: Scene): Component[] {
    return scene.entities.flatMap((entity) => entity.components);
  }

  #runSystems(phase: SystemPhase, frameContext: RuntimeFrameContext, dt: number): void {
    for (const system of this.#systems) {
      if (system.phase === phase) {
        system.run(frameContext, dt);
      }
    }
  }

  #startPendingComponents(frameContext: RuntimeFrameContext): void {
    for (const component of this.#iterateComponents(frameContext.scene)) {
      if (component.started) {
        continue;
      }

      component.markStarted();
      component.start(frameContext);
    }
  }
}

export function createBrowserFrameDriver(): RuntimeFrameDriver {
  const globalWindow = globalThis.window;
  const globalPerformance = globalThis.performance;

  if (!globalWindow || !globalPerformance) {
    throw new Error('No browser frame driver was found. Provide "host:frame-driver" when running outside the browser.');
  }

  return {
    cancelAnimationFrame: globalWindow.cancelAnimationFrame.bind(globalWindow),
    now: () => globalPerformance.now(),
    requestAnimationFrame: globalWindow.requestAnimationFrame.bind(globalWindow)
  };
}

export function createNodeFrameDriver(): RuntimeFrameDriver {
  const handles = new Map<number, ReturnType<typeof setTimeout>>();
  let nextHandle = 0;

  return {
    cancelAnimationFrame(handle) {
      const timeout = handles.get(handle);

      if (!timeout) {
        return;
      }

      clearTimeout(timeout);
      handles.delete(handle);
    },
    now: () => Date.now(),
    requestAnimationFrame(callback) {
      nextHandle += 1;
      const handle = nextHandle;
      const timeout = setTimeout(() => {
        handles.delete(handle);
        callback(Date.now());
      }, 16);

      handles.set(handle, timeout);
      return handle;
    }
  };
}

export function createDefaultFrameDriver(): RuntimeFrameDriver {
  if (typeof window !== "undefined" && typeof performance !== "undefined") {
    return createBrowserFrameDriver();
  }

  return createNodeFrameDriver();
}

export function getRuntime(ctx: MGEKernelContext): Runtime {
  return ctx.services.require<Runtime>("runtime");
}

let nextNumericId = 0;

function nextId(prefix: string): string {
  nextNumericId += 1;
  return `${prefix}:${nextNumericId}`;
}

const coreModule: MGECModule = {
  id: "@mge/core",

  dispose(ctx) {
    getRuntime(ctx).dispose();
    ctx.log.info("Runtime stopped.");
  },

  run(ctx) {
    getRuntime(ctx).startLoop();
    ctx.log.info("Runtime loop scheduled.");
  },

  setup(ctx) {
    const frameDriver = ctx.services.has("host:frame-driver")
      ? ctx.services.require<RuntimeFrameDriver>("host:frame-driver")
      : createDefaultFrameDriver();
    const runtime = new Runtime(ctx.services, frameDriver);

    ctx.services.provide("core", { version: ctx.component.version }, ctx.component.id);
    ctx.services.provide("runtime", runtime, ctx.component.id);
    ctx.log.info("Registered the runtime loop.");
  }
};

export default coreModule;
