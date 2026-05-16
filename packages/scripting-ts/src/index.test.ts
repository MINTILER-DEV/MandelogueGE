import { describe, expect, it } from "vitest";

import { ServiceRegistry } from "../../kernel/src/index.js";
import { Script } from "@mge/core";
import { Runtime, type RuntimeFrameDriver } from "@mge/runtime";
import { Entity, Scene, Transform } from "@mge/scene";

import { normalizeScriptPath, ScriptComponent, syncScriptComponentProperties, type ScriptRuntimeService } from "./index.js";

class TestPlayerController extends Script {
  speed = 120;

  override update(dt: number): void {
    if (this.input.keyDown("KeyD")) {
      this.transform.x += this.speed * dt;
    }
  }
}

function frameDriver(): RuntimeFrameDriver {
  return {
    cancelAnimationFrame() {},
    now() {
      return 1000;
    },
    requestAnimationFrame() {
      return 1;
    }
  };
}

describe("@mge/scripting-ts", () => {
  it("binds a user script to an entity and applies script properties", () => {
    const services = new ServiceRegistry();
    const down = new Set<string>(["KeyD"]);
    const runtime = new Runtime(services, frameDriver());
    const scene = new Scene("Scripts");
    const entity = new Entity("Player");
    const scriptRuntime: ScriptRuntimeService = {
      applyScriptProperties() {
        return 0;
      },
      createScriptComponent(definition) {
        return new ScriptComponent(definition);
      },
      registerScript() {},
      reloadScript() {
        return 0;
      },
      resolveScript() {
        return TestPlayerController;
      }
    };

    services.provide("runtime", runtime, "test");
    services.provide("script-runtime", scriptRuntime, "test");
    services.provide(
      "input",
      {
        keyDown(code: string) {
          return down.has(code);
        }
      },
      "test"
    );
    services.provide(
      "time",
      {
        delta: 0,
        elapsed: 0,
        frame: 0,
        scale: 1
      },
      "test"
    );

    entity.addComponent(new Transform({ x: 10, y: 20 }));
    entity.addComponent(
      new ScriptComponent({
        properties: { speed: 240 },
        script: "./scripts/PlayerController.ts"
      })
    );
    scene.addEntity(entity);
    runtime.setActiveScene(scene);

    runtime.tick(1000);
    runtime.tick(1016.6667);

    expect(entity.getComponent(Transform)?.x).toBeCloseTo(18, 4);
  });

  it("normalizes script paths before lookup", () => {
    expect(normalizeScriptPath("./scripts/PlayerController.ts")).toBe("scripts/PlayerController.ts");
    expect(normalizeScriptPath(".\\scripts\\PlayerController.ts")).toBe("scripts/PlayerController.ts");
  });

  it("syncs script component properties by adding, updating, and removing fields", () => {
    const component = new ScriptComponent({
      properties: {
        keep: 1,
        removeMe: true
      },
      script: "./scripts/Test.ts"
    });

    const changed = syncScriptComponentProperties(component, {
      added: "value",
      keep: 2
    });

    expect(changed).toBe(true);
    expect(component.properties).toEqual({
      added: "value",
      keep: 2
    });
  });
});
