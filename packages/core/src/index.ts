import type { MGECModule } from "@mge/kernel";

type CoreService = {
  lifecycle: string[];
  started: boolean;
  version: string;
};

const coreModule: MGECModule = {
  id: "@mge/core",

  setup(ctx) {
    const service: CoreService = {
      lifecycle: ["setup"],
      started: false,
      version: ctx.component.version
    };

    ctx.services.provide("core", service, ctx.component.id);
    ctx.log.info("Registered the core service.");
  },

  start(ctx) {
    const service = ctx.services.require<CoreService>("core");
    service.started = true;
    service.lifecycle.push("start");
    ctx.log.info("Core MGEC started.");
  },

  dispose(ctx) {
    const service = ctx.services.require<CoreService>("core");
    service.lifecycle.push("dispose");
    ctx.log.info("Core MGEC disposed.");
  }
};

export default coreModule;

