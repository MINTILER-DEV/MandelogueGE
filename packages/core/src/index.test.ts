import { describe, expect, it } from "vitest";

import { ServiceRegistry } from "@mge/kernel";

import { Component, Runtime, Transform } from "./index.js";

describe("@mge/core runtime", () => {
  it("runs systems and component lifecycle in frame order", () => {
    const services = new ServiceRegistry();
    const frameTimes: Array<(timestampMs: number) => void> = [];
    const runtime = new Runtime(services, {
      cancelAnimationFrame() {},
      now() {
        return 1000;
      },
      requestAnimationFrame(callback) {
        frameTimes.push(callback);
        return frameTimes.length;
      }
    });
    const scene = runtime.createScene("Test");
    const events: string[] = [];

    class TestComponent extends Component {
      override start(): void {
        events.push("component:start");
      }

      override update(_ctx: unknown, dt: number): void {
        events.push(`component:update:${dt.toFixed(3)}`);
      }

      override render(): void {
        events.push("component:render");
      }
    }

    runtime.setActiveScene(scene);
    runtime.registerSystem({
      id: "system:update",
      phase: "update",
      run(_ctx, dt) {
        events.push(`system:update:${dt.toFixed(3)}`);
      }
    });
    runtime.registerSystem({
      id: "system:render",
      phase: "render",
      run() {
        events.push("system:render");
      }
    });

    const entity = scene.createEntity("Square");
    entity.addComponent(new Transform({ x: 10, y: 20 }));
    entity.addComponent(new TestComponent());

    runtime.tick(1000);
    runtime.tick(1016.6667);

    expect(events).toEqual([
      "component:start",
      "system:update:0.017",
      "component:update:0.017",
      "system:render",
      "component:render",
      "system:update:0.017",
      "component:update:0.017",
      "system:render",
      "component:render"
    ]);
  });
});
