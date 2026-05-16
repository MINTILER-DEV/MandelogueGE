import { describe, expect, it } from "vitest";
import { createAssetMetadata } from "./index.js";

describe("@mge/assets", () => {
  it("creates image metadata with an image importer", () => {
    expect(createAssetMetadata("./assets/player.png", "image/png")).toEqual({
      id: "asset:assets/player-png",
      importer: "@mge/importer-image",
      path: "./assets/player.png",
      settings: {
        filter: "nearest"
      },
      type: "image/png"
    });
  });
});
