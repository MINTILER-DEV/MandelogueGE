import type { MGECModule, MGEKernelContext, ServiceRegistry } from "@mge/kernel";

export type SystemPhase = "fixed" | "update" | "render";

export interface RuntimeFrameDriver {
  cancelAnimationFrame(handle: number): void;
  now(): number;
  requestAnimationFrame(callback: (timestampMs: number) => void): number;
}

export interface RuntimeComponentLike {
  readonly started: boolean;
  markStarted(): void;
  render(ctx: RuntimeFrameContext): void;
  start(ctx: RuntimeFrameContext): void;
  update(ctx: RuntimeFrameContext, dt: number): void;
}

export interface RuntimeEntityLike {
  readonly components: RuntimeComponentLike[];
}

export interface RuntimeSceneLike {
  readonly entities: RuntimeEntityLike[];
  attachRuntime(runtime: Runtime): void;
}

export interface RuntimeFrameContext {
  dt: number;
  elapsed: number;
  frame: number;
  runtime: Runtime;
  scene: RuntimeSceneLike;
  services: ServiceRegistry;
}

export interface RuntimeSystem {
  id: string;
  phase: SystemPhase;
  priority?: number;
  run(ctx: RuntimeFrameContext, dt: number): void;
}

export interface RuntimeService {
  readonly services: ServiceRegistry;
  getActiveScene<TScene extends RuntimeSceneLike = RuntimeSceneLike>(): TScene;
  getScene<TScene extends RuntimeSceneLike = RuntimeSceneLike>(): TScene | null;
  isDisposed(): boolean;
  isRunning(): boolean;
  registerSystem(system: RuntimeSystem): void;
  setActiveScene(scene: RuntimeSceneLike): void;
  startLoop(): void;
  dispose(): void;
  stopLoop(): void;
  tick(timestampMs?: number): void;
}

export class Runtime implements RuntimeService {
  readonly #frameDriver: RuntimeFrameDriver;
  readonly #services: ServiceRegistry;
  readonly #systems: RuntimeSystem[] = [];
  #activeScene: RuntimeSceneLike | null = null;
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

  getActiveScene<TScene extends RuntimeSceneLike = RuntimeSceneLike>(): TScene {
    if (!this.#activeScene) {
      throw new Error("No active scene has been set.");
    }

    return this.#activeScene as TScene;
  }

  getScene<TScene extends RuntimeSceneLike = RuntimeSceneLike>(): TScene | null {
    return this.#activeScene as TScene | null;
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

  setActiveScene(scene: RuntimeSceneLike): void {
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

    const deltaSeconds =
      this.#lastTimestampMs === null ? 1 / 60 : Math.min((timestampMs - this.#lastTimestampMs) / 1000, 0.1);
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

  #iterateComponents(scene: RuntimeSceneLike): RuntimeComponentLike[] {
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

const runtimeModule: MGECModule = {
  id: "@mge/runtime",

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

    ctx.services.provide("runtime", runtime, ctx.component.id);
    ctx.log.info("Registered the runtime loop.");
  }
};

export default runtimeModule;
