import type { MGECModule, ServiceRegistry } from "@mge/kernel";
import { Transform, type Component, type Entity, type Scene } from "@mge/scene";
import type { Runtime, RuntimeFrameContext } from "@mge/runtime";

export type { RuntimeFrameContext, RuntimeFrameDriver, RuntimeSystem } from "@mge/runtime";

export interface KeyboardInputLike {
  keyDown(code: string): boolean;
}

export type ComponentSchemaFieldType = "asset" | "boolean" | "color" | "enum" | "number" | "script" | "string";

export interface ComponentSchemaFieldOption {
  label: string;
  value: string;
}

export interface ComponentSchemaField {
  default?: boolean | number | string;
  icon?: string;
  label?: string;
  max?: number;
  min?: number;
  options?: ComponentSchemaFieldOption[];
  step?: number;
  type: ComponentSchemaFieldType;
}

export interface EntityTemplateDefinition {
  create(context: {
    name?: string;
    scene: Scene;
    services: ServiceRegistry;
  }): Entity;
  description?: string;
  icon?: string;
  id: string;
  label: string;
}

export interface ComponentFactory {
  create(data?: Record<string, unknown>): Component;
  displayName?: string;
  icon?: string;
  matches?(component: Component): boolean;
  schema?: Record<string, ComponentSchemaField>;
  serialize?(component: Component): Record<string, unknown>;
  type: string;
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
    return this.frameContext.scene as Scene;
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

const coreModule: MGECModule = {
  id: "@mge/core",

  setup(ctx) {
    ctx.services.provide("core", { version: ctx.component.version }, ctx.component.id);
    ctx.log.info("Registered the core service.");
  }
};

export default coreModule;
