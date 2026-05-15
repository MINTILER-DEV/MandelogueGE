import type { MGECModule } from "@mge/kernel";

type CoreService = {
  lifecycle: string[];
  started: boolean;
  version: string;
};

type ExampleService = {
  bootOrder: string[];
  coreVersion: string;
  started: boolean;
};

const testPackageModule: MGECModule = {
  id: "@mge/test-package",

  setup(ctx) {
    const core = ctx.services.require<CoreService>("core");
    const service: ExampleService = {
      bootOrder: [ctx.component.id],
      coreVersion: core.version,
      started: false
    };

    ctx.services.provide("example", service, ctx.component.id);
    ctx.extensions.register("demo:messages", {
      componentId: ctx.component.id,
      text: `Bound to @mge/core ${core.version}`
    });
    ctx.log.info("Registered the example service.");
  },

  start(ctx) {
    const service = ctx.services.require<ExampleService>("example");
    service.started = true;
    service.bootOrder.push("start");
    ctx.log.info("Example MGEC started.");
  },

  run(ctx) {
    const service = ctx.services.require<ExampleService>("example");
    service.bootOrder.push("run");
    ctx.log.info(`Dependency order: ${ctx.kernel.resolvedOrder.join(" -> ")}`);
  },

  dispose(ctx) {
    const service = ctx.services.require<ExampleService>("example");
    service.bootOrder.push("dispose");
    ctx.log.info("Example MGEC disposed.");
  }
};

export default testPackageModule;

