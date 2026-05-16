import { Component, type ComponentFactory, type Runtime, type RuntimeFrameContext, type Script } from "@mge/core";
import type { ECSService } from "@mge/ecs";
import type { MGECModule } from "@mge/kernel";

export type ScriptConstructor = new () => Script;

export type ScriptModuleLike = ScriptConstructor | { default: ScriptConstructor };

export type ScriptSourceRegistry = Record<string, ScriptModuleLike>;

export interface ScriptComponentDefinition {
  properties?: Record<string, unknown>;
  script: string;
}

export interface ScriptRuntimeService {
  applyScriptProperties(scriptPath: string, properties: Record<string, unknown>): number;
  createScriptComponent(definition: ScriptComponentDefinition): ScriptComponent;
  registerScript(scriptPath: string, moduleLike: ScriptModuleLike): void;
  reloadScript(scriptPath: string): number;
  resolveScript(scriptPath: string): ScriptConstructor;
}

function normalizeScriptConstructor(moduleLike: ScriptModuleLike): ScriptConstructor {
  if (typeof moduleLike === "function") {
    return moduleLike;
  }

  if (typeof moduleLike.default === "function") {
    return moduleLike.default;
  }

  throw new Error("Script module must export a default Script class.");
}

export class ScriptComponent extends Component {
  readonly properties: Record<string, unknown>;
  readonly script: string;
  #instance: Script | null = null;

  constructor(definition: ScriptComponentDefinition) {
    super();
    this.script = definition.script;
    this.properties = { ...(definition.properties ?? {}) };
  }

  destroy(ctx: RuntimeFrameContext): void {
    this.#destroyInstance(ctx);
  }

  #createInstance(ScriptClass: ScriptConstructor, ctx: RuntimeFrameContext): void {
    const instance = new ScriptClass();

    Object.assign(instance, this.properties);
    instance.attach(this.entity);
    instance.setFrameContext(ctx);
    instance.start();
    this.#instance = instance;
  }

  #destroyInstance(ctx: RuntimeFrameContext): void {
    if (!this.#instance) {
      return;
    }

    this.#instance.setFrameContext(ctx);
    this.#instance.destroy();
    this.#instance = null;
  }

  get instance(): Script | null {
    return this.#instance;
  }

  render(ctx: RuntimeFrameContext): void {
    if (!this.#instance) {
      return;
    }

    this.#instance.setFrameContext(ctx);
    this.#instance.render();
  }

  start(ctx: RuntimeFrameContext): void {
    if (!this.script) {
      console.warn("ScriptComponent started without a script path.");
      return;
    }

    const runtime = ctx.services.require<ScriptRuntimeService>("script-runtime");
    this.#createInstance(runtime.resolveScript(this.script), ctx);
  }

  reload(ctx: RuntimeFrameContext, ScriptClass?: ScriptConstructor): void {
    if (!this.script) {
      return;
    }

    const runtime = ctx.services.require<ScriptRuntimeService>("script-runtime");
    this.#destroyInstance(ctx);
    this.#createInstance(ScriptClass ?? runtime.resolveScript(this.script), ctx);
  }

  update(ctx: RuntimeFrameContext, dt: number): void {
    if (!this.#instance) {
      return;
    }

    this.#instance.setFrameContext(ctx);
    this.#instance.update(dt);
  }
}

export function normalizeScriptPath(scriptPath: string): string {
  return scriptPath.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function syncScriptComponentProperties(
  component: ScriptComponent,
  properties: Record<string, unknown>
): boolean {
  const instanceRecord = component.instance as unknown as Record<string, unknown> | null;
  const nextKeys = new Set(Object.keys(properties));
  let changed = false;

  for (const key of Object.keys(component.properties)) {
    if (nextKeys.has(key)) {
      continue;
    }

    delete component.properties[key];

    if (instanceRecord && key in instanceRecord) {
      delete instanceRecord[key];
    }

    changed = true;
  }

  for (const [key, value] of Object.entries(properties)) {
    if (component.properties[key] === value) {
      continue;
    }

    component.properties[key] = value;

    if (instanceRecord) {
      instanceRecord[key] = value;
    }

    changed = true;
  }

  return changed;
}

function createScriptComponent(data: Record<string, unknown> = {}): ScriptComponent {
  return new ScriptComponent({
    properties: isRecord(data.properties) ? data.properties : {},
    script: typeof data.script === "string" ? data.script : ""
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const scriptingTsModule: MGECModule = {
  id: "@mge/scripting-ts",

  setup(ctx) {
    const scripts = new Map<string, ScriptConstructor>();
    const runtime = ctx.services.require<Runtime>("runtime");
    const hostSources = ctx.services.has("host:script-sources")
      ? ctx.services.require<ScriptSourceRegistry>("host:script-sources")
      : {};

    const scriptRuntime: ScriptRuntimeService = {
      applyScriptProperties(scriptPath, properties) {
        const scene = runtime.getScene();

        if (!scene) {
          return 0;
        }

        const normalizedPath = normalizeScriptPath(scriptPath);

        let updatedCount = 0;

        for (const entity of scene.entities) {
          for (const component of entity.components) {
            if (
              !(component instanceof ScriptComponent) ||
              normalizeScriptPath(component.script) !== normalizedPath
            ) {
              continue;
            }

            if (syncScriptComponentProperties(component, properties)) {
              updatedCount += 1;
            }
          }
        }

        return updatedCount;
      },
      createScriptComponent(definition) {
        return new ScriptComponent(definition);
      },
      registerScript(scriptPath, moduleLike) {
        scripts.set(normalizeScriptPath(scriptPath), normalizeScriptConstructor(moduleLike));
      },
      reloadScript(scriptPath) {
        const scene = runtime.getScene();

        if (!scene) {
          return 0;
        }

        const normalizedPath = normalizeScriptPath(scriptPath);
        const ScriptClass = scriptRuntime.resolveScript(scriptPath);
        const frameContext = createReloadFrameContext(runtime, scene);
        let reloadedCount = 0;

        for (const entity of scene.entities) {
          for (const component of entity.components) {
            if (
              !(component instanceof ScriptComponent) ||
              normalizeScriptPath(component.script) !== normalizedPath ||
              !component.started
            ) {
              continue;
            }

            component.reload(frameContext, ScriptClass);
            reloadedCount += 1;
          }
        }

        return reloadedCount;
      },
      resolveScript(scriptPath) {
        const ScriptClass = scripts.get(normalizeScriptPath(scriptPath));

        if (!ScriptClass) {
          throw new Error(`No TypeScript script has been registered for path "${scriptPath}".`);
        }

        return ScriptClass;
      }
    };

    for (const [scriptPath, moduleLike] of Object.entries(hostSources)) {
      scriptRuntime.registerScript(scriptPath, moduleLike);
    }

    ctx.services.provide("script-runtime", scriptRuntime, ctx.component.id);
    ctx.services.provide("scripting", scriptRuntime, ctx.component.id);
    ctx.services.require<ECSService>("ecs").registerComponentFactory({
      create: createScriptComponent,
      matches(component) {
        return component instanceof ScriptComponent;
      },
      serialize(component) {
        const scriptComponent = component as ScriptComponent;

        return {
          properties: { ...scriptComponent.properties },
          script: scriptComponent.script
        };
      },
      type: "Script"
    } satisfies ComponentFactory);
    ctx.log.info(`Registered TypeScript scripting with ${scripts.size} script source(s).`);
  }
};

function createReloadFrameContext(runtime: Runtime, scene: ReturnType<Runtime["getActiveScene"]>): RuntimeFrameContext {
  return {
    dt: 0,
    elapsed: 0,
    frame: 0,
    runtime,
    scene,
    services: runtime.services
  };
}

export default scriptingTsModule;
