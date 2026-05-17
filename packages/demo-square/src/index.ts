import type { MGECModule } from "@mge/kernel";
import type { ComponentFactory, EntityTemplateDefinition } from "@mge/core";
import type { ECSService } from "@mge/ecs";
import type { Canvas2DRendererService } from "@mge/renderer-canvas2d";
import type { RuntimeFrameContext } from "@mge/runtime";
import { Component, Transform } from "@mge/scene";
import type { SceneService } from "@mge/scene";
import type { ScriptRuntimeService } from "@mge/scripting-ts";

export class SquareComponent extends Component {
  color = "#ff7a1a";
  height = 56;
  width = 56;

  constructor(init?: Partial<SquareComponent>) {
    super();
    Object.assign(this, init);
  }

  start(ctx: RuntimeFrameContext): void {
    const transform = this.entity.getComponent(Transform);
    const renderer = ctx.services.require<Canvas2DRendererService>("renderer");

    if (!transform) {
      throw new Error("SquareComponent requires a Transform component.");
    }

    const { height, width } = renderer.bounds();
    transform.x = Math.max(transform.x, 32);
    transform.y = transform.y === 0 ? Math.floor(height / 2 - this.height / 2) : transform.y;

    if (transform.x + this.width > width) {
      transform.x = width - this.width - 16;
    }
  }

  render(ctx: RuntimeFrameContext): void {
    const transform = this.entity.getComponent(Transform);
    const renderer = ctx.services.require<Canvas2DRendererService>("renderer");

    if (!transform) {
      return;
    }

    renderer.drawRect(transform.x, transform.y, this.width, this.height, this.color);
  }

}

function createSquare(data: Record<string, unknown> = {}): SquareComponent {
  return new SquareComponent({
    color: typeof data.color === "string" ? data.color : "#ff7a1a",
    height: typeof data.height === "number" ? data.height : 56,
    width: typeof data.width === "number" ? data.width : 56
  });
}

const demoSquareModule: MGECModule = {
  id: "@mge/demo-square",

  setup(ctx) {
    const ecs = ctx.services.require<ECSService>("ecs");

    ecs.registerComponentFactory({
      create: createSquare,
      displayName: "SquareComponent",
      icon: "codicon codicon-primitive-square",
      matches(component) {
        return component instanceof SquareComponent;
      },
      schema: {
        color: { type: "color" },
        height: { min: 1, step: 1, type: "number" },
        width: { min: 1, step: 1, type: "number" }
      },
      serialize(component) {
        const square = component as SquareComponent;

        return {
          color: square.color,
          height: square.height,
          width: square.width
        };
      },
      type: "Square"
    } satisfies ComponentFactory);
    ctx.extensions.register("mge:create-entity-template", {
      create({ name, scene, services }: Parameters<EntityTemplateDefinition["create"]>[0]) {
        const ecs = services.require<ECSService>("ecs");
        const entity = scene.createEntity(name ?? "Square");
        entity.addComponent(new Transform());
        ecs.addComponent(entity, "Square");
        return entity;
      },
      description: "Create a square renderable entity.",
      icon: "codicon codicon-primitive-square",
      id: "mge.entity.square",
      label: "Square"
    });
    ctx.log.info("Registered the Square component.");
  },

  start(ctx) {
    const ecs = ctx.services.require<ECSService>("ecs");
    const scene = ctx.services.require<SceneService>("scene").getActive();
    const scriptRuntime = ctx.services.require<ScriptRuntimeService>("script-runtime");
    const entity = ecs.createEntity("Demo Square", scene);

    entity.addComponent(new Transform({ x: 32, y: 0 }));
    entity.addComponent(new SquareComponent());
    entity.addComponent(
      scriptRuntime.createScriptComponent({
        properties: { speed: 220 },
        script: "./scripts/PlayerController.ts"
      })
    );
    ctx.log.info("Spawned the demo square entity.");
  }
};

export default demoSquareModule;
