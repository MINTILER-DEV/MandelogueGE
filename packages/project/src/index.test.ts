import { describe, expect, it } from "vitest";
import { buildLockfile } from "./index.js";

describe("@mge/project", () => {
  it("builds a lockfile from the current project manifest", () => {
    const lockfile = buildLockfile(
      {
        components: {
          "@mge/assets": "^0.1.0",
          "@mge/core": "^0.1.0"
        },
        engine: "MandelogueGE",
        name: "Example",
        type: "engine-editor"
      },
      [
        {
          entry: "./dist/index.js",
          id: "@mge/assets",
          name: "Assets",
          targets: ["editor"],
          version: "0.1.0"
        },
        {
          entry: "./dist/index.js",
          id: "@mge/core",
          name: "Core",
          targets: ["editor"],
          version: "0.1.2"
        }
      ]
    );

    expect(lockfile).toEqual({
      packages: {
        "@mge/assets": {
          resolved: "^0.1.0",
          source: "workspace",
          version: "0.1.0"
        },
        "@mge/core": {
          resolved: "^0.1.0",
          source: "workspace",
          version: "0.1.2"
        }
      }
    });
  });
});
