import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { MGEKernel } from "./index.js";

const tempDirs: string[] = [];

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function makeWorkspace(): Promise<string> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "mge-kernel-test-"));
  tempDirs.push(rootDir);

  await mkdir(path.join(rootDir, "packages", "alpha"), { recursive: true });
  await mkdir(path.join(rootDir, "packages", "beta"), { recursive: true });
  await mkdir(path.join(rootDir, "example"), { recursive: true });

  await writeJson(path.join(rootDir, "packages", "alpha", ".mgec.json"), {
    id: "@mge/alpha",
    name: "Alpha",
    version: "0.1.0",
    entry: "./index.js",
    targets: ["runtime"],
    providesFeatures: ["service:alpha"]
  });

  await writeFile(
    path.join(rootDir, "packages", "alpha", "index.js"),
    [
      "export default {",
      "  id: '@mge/alpha',",
      "  setup(ctx) {",
      "    const trace = ['alpha:setup'];",
      "    ctx.services.provide('trace', trace, '@mge/alpha');",
      "  },",
      "  start(ctx) {",
      "    ctx.services.require('trace').push('alpha:start');",
      "  },",
      "  dispose(ctx) {",
      "    ctx.services.require('trace').push('alpha:dispose');",
      "  }",
      "};",
      ""
    ].join("\n"),
    "utf8"
  );

  await writeJson(path.join(rootDir, "packages", "beta", ".mgec.json"), {
    id: "@mge/beta",
    name: "Beta",
    version: "0.1.0",
    entry: "./index.js",
    targets: ["runtime"],
    requires: {
      "@mge/alpha": "^0.1.0"
    },
    requiresFeatures: ["service:alpha"]
  });

  await writeFile(
    path.join(rootDir, "packages", "beta", "index.js"),
    [
      "export default {",
      "  id: '@mge/beta',",
      "  setup(ctx) {",
      "    ctx.services.require('trace').push('beta:setup');",
      "  },",
      "  start(ctx) {",
      "    ctx.services.require('trace').push('beta:start');",
      "  },",
      "  run(ctx) {",
      "    ctx.services.require('trace').push(`beta:run:${ctx.kernel.resolvedOrder.join('>')}`);",
      "  },",
      "  dispose(ctx) {",
      "    ctx.services.require('trace').push('beta:dispose');",
      "  }",
      "};",
      ""
    ].join("\n"),
    "utf8"
  );

  await writeJson(path.join(rootDir, "example", ".mgeproject.json"), {
    name: "Kernel Proof",
    type: "game",
    engine: "MandelogueGE",
    components: {
      "@mge/beta": "^0.1.0"
    }
  });

  return rootDir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("MGEKernel", () => {
  it("resolves dependencies and runs lifecycle hooks in graph order", async () => {
    const workspaceRoot = await makeWorkspace();
    const kernel = new MGEKernel({
      emitDiagnosticsToConsole: false,
      projectFile: path.join(workspaceRoot, "example", ".mgeproject.json"),
      workspaceRoot
    });

    await kernel.boot();
    await kernel.run();

    expect(kernel.resolvedOrder).toEqual(["@mge/alpha", "@mge/beta"]);
    expect(kernel.services.require<string[]>("trace")).toEqual([
      "alpha:setup",
      "beta:setup",
      "alpha:start",
      "beta:start",
      "beta:run:@mge/alpha>@mge/beta"
    ]);

    await kernel.dispose();

    expect(kernel.services.require<string[]>("trace")).toEqual([
      "alpha:setup",
      "beta:setup",
      "alpha:start",
      "beta:start",
      "beta:run:@mge/alpha>@mge/beta",
      "beta:dispose",
      "alpha:dispose"
    ]);
  });

  it("fails fast when a required feature is missing", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "mge-kernel-feature-"));
    tempDirs.push(workspaceRoot);

    await mkdir(path.join(workspaceRoot, "packages", "missing"), { recursive: true });
    await mkdir(path.join(workspaceRoot, "example"), { recursive: true });

    await writeJson(path.join(workspaceRoot, "packages", "missing", ".mgec.json"), {
      id: "@mge/missing",
      name: "Missing Feature",
      version: "0.1.0",
      entry: "./index.js",
      targets: ["runtime"],
      requiresFeatures: ["service:not-there"]
    });

    await writeFile(path.join(workspaceRoot, "packages", "missing", "index.js"), "export default {};\n", "utf8");

    await writeJson(path.join(workspaceRoot, "example", ".mgeproject.json"), {
      name: "Broken Project",
      type: "game",
      engine: "MandelogueGE",
      components: {
        "@mge/missing": "^0.1.0"
      }
    });

    const kernel = new MGEKernel({
      emitDiagnosticsToConsole: false,
      projectFile: path.join(workspaceRoot, "example", ".mgeproject.json"),
      workspaceRoot
    });

    await expect(kernel.resolveProject()).rejects.toThrow('requires feature "service:not-there"');
  });
});

