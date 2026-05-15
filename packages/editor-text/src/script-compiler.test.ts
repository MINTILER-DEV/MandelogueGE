import { describe, expect, it } from "vitest";

import { Script } from "@mge/core";

import { compileTypeScriptModule, evaluateCommonJsModule } from "./script-compiler.js";

describe("@mge/editor-text script compiler", () => {
  it("compiles and evaluates a TypeScript gameplay script", () => {
    const compilation = compileTypeScriptModule(
      [
        'import { Script } from "@mge/core";',
        "",
        "export default class PlayerController extends Script {",
        "  speed = 240;",
        "}",
        ""
      ].join("\n"),
      "./scripts/PlayerController.ts"
    );

    expect(compilation.code).toContain('require("@mge/core")');

    const moduleLike = evaluateCommonJsModule(compilation.code, "./scripts/PlayerController.ts", {
      "@mge/core": { Script }
    });
    const PlayerController = moduleLike.default as new () => Script & { speed: number };
    const instance = new PlayerController();

    expect(instance).toBeInstanceOf(Script);
    expect(instance.speed).toBe(240);
  });

  it("rejects unsupported imports during evaluation", () => {
    const compilation = compileTypeScriptModule(
      [
        'import { something } from "./not-supported";',
        "export default class Unsupported {",
        "  value = something;",
        "}",
        ""
      ].join("\n"),
      "./scripts/Unsupported.ts"
    );

    expect(() => evaluateCommonJsModule(compilation.code, "./scripts/Unsupported.ts", {})).toThrow(
      'imports unsupported module "./not-supported"'
    );
  });
});
