import { Component, type ComponentFactory, type RuntimeFrameContext, type Script } from "@mge/core";
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
  createScriptComponent(definition: ScriptComponentDefinition): ScriptComponent;
  registerScript(scriptPath: string, moduleLike: ScriptModuleLike): void;
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
    if (!this.#instance) {
      return;
    }

    this.#instance.setFrameContext(ctx);
    this.#instance.destroy();
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
      throw new Error("ScriptComponent requires a script path.");
    }

    const runtime = ctx.services.require<ScriptRuntimeService>("script-runtime");
    const ScriptClass = runtime.resolveScript(this.script);
    const instance = new ScriptClass();

    Object.assign(instance, this.properties);
    instance.attach(this.entity);
    instance.setFrameContext(ctx);
    instance.start();
    this.#instance = instance;
  }

  update(ctx: RuntimeFrameContext, dt: number): void {
    if (!this.#instance) {
      return;
    }

    this.#instance.setFrameContext(ctx);
    this.#instance.update(dt);
  }
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
    const hostSources = ctx.services.has("host:script-sources")
      ? ctx.services.require<ScriptSourceRegistry>("host:script-sources")
      : {};

    const scriptRuntime: ScriptRuntimeService = {
      createScriptComponent(definition) {
        return new ScriptComponent(definition);
      },
      registerScript(scriptPath, moduleLike) {
        scripts.set(scriptPath, normalizeScriptConstructor(moduleLike));
      },
      resolveScript(scriptPath) {
        const ScriptClass = scripts.get(scriptPath);

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
    ctx.services.require<ECSService>("ecs").registerComponentFactory({
      create: createScriptComponent,
      type: "Script"
    } satisfies ComponentFactory);
    ctx.log.info(`Registered TypeScript scripting with ${scripts.size} script source(s).`);
  }
};

export default scriptingTsModule;
