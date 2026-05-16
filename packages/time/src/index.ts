import type { MGECModule } from "@mge/kernel";
import { getRuntime } from "@mge/runtime";

export interface TimeService {
  delta: number;
  elapsed: number;
  frame: number;
  scale: number;
}

const timeModule: MGECModule = {
  id: "@mge/time",

  setup(ctx) {
    const runtime = getRuntime(ctx);
    const time: TimeService = {
      delta: 0,
      elapsed: 0,
      frame: 0,
      scale: 1
    };

    ctx.services.provide("time", time, ctx.component.id);
    runtime.registerSystem({
      id: "@mge/time/update",
      phase: "update",
      priority: -1000,
      run(_frame, dt) {
        time.delta = dt * time.scale;
        time.elapsed += time.delta;
        time.frame += 1;
      }
    });
    ctx.log.info("Registered the time service.");
  }
};

export default timeModule;
