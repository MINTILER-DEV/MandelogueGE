import { describe, expect, it } from "vitest";

import { ServiceRegistry } from "../../kernel/src/index.js";
import { Entity, Transform } from "@mge/scene";

import { Script } from "./index.js";

describe("@mge/core", () => {
  it("binds script helpers to the entity and service registry", () => {
    const services = new ServiceRegistry();
    const entity = new Entity("Player");
    const transform = entity.addComponent(new Transform({ x: 12, y: 24 }));
    const script = new Script();

    services.provide("input", { keyDown() { return true; } }, "test");
    services.provide("time", { delta: 0.016, elapsed: 1, frame: 2, scale: 1 }, "test");

    script.attach(entity);
    script.setFrameContext({
      dt: 0.016,
      elapsed: 1,
      frame: 2,
      runtime: {} as never,
      scene: {} as never,
      services
    });

    expect(script.transform).toBe(transform);
    expect(script.input.keyDown("KeyD")).toBe(true);
    expect(script.time.frame).toBe(2);
  });
});
