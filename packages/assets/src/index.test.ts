import { describe, expect, it } from "vitest";

import type { EditorProjectFile, EditorService } from "@mge/editor-core";

import { createAssetMetadata, normalizeImportedAssetPath, resolveAssetImportPath } from "./index.js";

function createEditor(files: string[]): EditorService {
  const projectFiles = new Map<string, EditorProjectFile>(
    files.map((path) => [
      path,
      {
        content: "",
        kind: "asset",
        path
      }
    ])
  );

  return {
    getProjectFile(path) {
      return projectFiles.get(path) ?? null;
    }
  } as EditorService;
}

describe("@mge/assets import paths", () => {
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

  it("preserves nested relative paths for synced folders", () => {
    expect(normalizeImportedAssetPath("Sprites\\Player Idle/frame 01.png")).toBe(
      "./assets/Sprites/Player-Idle/frame-01.png"
    );
  });

  it("falls back to a deconflicted asset name for flat imports", () => {
    const editor = createEditor(["./assets/player.png", "./assets/player.png.assetmeta.json"]);

    expect(
      resolveAssetImportPath(editor, {
        content: "",
        fileName: "player.png",
        mimeType: "image/png"
      })
    ).toBe("./assets/player-2.png");
  });
});
