import type { EditorService } from "@mge/editor-core";
import type { MGECModule } from "@mge/kernel";

export interface AssetMetadata {
  id: string;
  importer: string;
  path: string;
  settings: Record<string, string>;
  type: string;
}

export interface AssetRecord {
  content: string;
  meta: AssetMetadata;
  metaPath: string;
  path: string;
}

export interface AssetImportDescriptor {
  content: string;
  fileName: string;
  mimeType: string;
  relativePath?: string;
}

export interface AssetsService {
  getAsset(path: string): AssetRecord | null;
  getMetadata(path: string): AssetMetadata | null;
  importFiles(files: AssetImportDescriptor[]): AssetRecord[];
  listAssets(): AssetRecord[];
}

const assetsModule: MGECModule = {
  id: "@mge/assets",

  setup(ctx) {
    const editor = ctx.services.require<EditorService>("editor");

    const assets: AssetsService = {
      getAsset(path) {
        const file = editor.getProjectFile(path);
        const meta = assets.getMetadata(path);

        if (!file || !meta) {
          return null;
        }

        return {
          content: file.content,
          meta,
          metaPath: metaPathFor(path),
          path
        };
      },
      getMetadata(path) {
        const metaFile = editor.getProjectFile(metaPathFor(path));

        if (!metaFile) {
          return null;
        }

        try {
          return JSON.parse(metaFile.content) as AssetMetadata;
        } catch {
          return null;
        }
      },
      importFiles(files) {
        const imported: AssetRecord[] = [];

        for (const file of files) {
          const path = resolveAssetImportPath(editor, file);
          const meta = createAssetMetadata(path, file.mimeType);
          const metaPath = metaPathFor(path);

          editor.updateProjectFile(path, file.content, {
            kind: "asset",
            select: imported.length === 0
          });
          editor.updateProjectFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, {
            kind: "assetmeta",
            select: false
          });
          imported.push({
            content: file.content,
            meta,
            metaPath,
            path
          });
        }

        if (imported.length > 0) {
          editor.saveProject();
        }

        return imported;
      },
      listAssets() {
        return editor
          .getProjectFiles()
          .filter((file) => file.kind === "asset" || isAssetPath(file.path))
          .map((file) => assets.getAsset(file.path))
          .filter((asset): asset is AssetRecord => Boolean(asset))
          .sort((left, right) => left.path.localeCompare(right.path));
      }
    };

    ctx.services.provide("assets", assets, ctx.component.id);
    ctx.log.info("Registered project asset management.");
  }
};

function createAssetMetadata(path: string, mimeType: string): AssetMetadata {
  return {
    id: `asset:${path.replace(/^\.\//, "").replace(/[^\w/-]+/g, "-")}`,
    importer: mimeType.startsWith("image/") ? "@mge/importer-image" : "@mge/importer-raw",
    path,
    settings: mimeType.startsWith("image/") ? { filter: "nearest" } : {},
    type: mimeType || "application/octet-stream"
  };
}

function isAssetPath(path: string): boolean {
  return path.startsWith("./assets/");
}

function metaPathFor(path: string): string {
  return `${path}.assetmeta.json`;
}

function resolveAssetImportPath(editor: EditorService, file: AssetImportDescriptor): string {
  if (typeof file.relativePath === "string" && file.relativePath.trim().length > 0) {
    return normalizeImportedAssetPath(file.relativePath);
  }

  return nextAssetPath(editor, file.fileName);
}

function nextAssetPath(editor: EditorService, fileName: string): string {
  const sanitized = sanitizeFileName(fileName);
  const extIndex = sanitized.lastIndexOf(".");
  const stem = extIndex >= 0 ? sanitized.slice(0, extIndex) : sanitized;
  const ext = extIndex >= 0 ? sanitized.slice(extIndex) : "";
  let index = 1;
  let candidate = `./assets/${sanitized}`;

  while (editor.getProjectFile(candidate) || editor.getProjectFile(metaPathFor(candidate))) {
    index += 1;
    candidate = `./assets/${stem}-${index}${ext}`;
  }

  return candidate;
}

function normalizeImportedAssetPath(relativePath: string): string {
  const sanitizedSegments = relativePath
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => sanitizePathSegment(segment))
    .filter(Boolean);

  if (sanitizedSegments.length === 0) {
    return "./assets/imported-file";
  }

  return `./assets/${sanitizedSegments.join("/")}`;
}

function sanitizeFileName(fileName: string): string {
  return sanitizePathSegment(fileName) || "file";
}

function sanitizePathSegment(value: string): string {
  const sanitized = value.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");

  if (!sanitized || sanitized === "." || sanitized === "..") {
    return "";
  }

  return sanitized;
}

export default assetsModule;
export { createAssetMetadata, isAssetPath, metaPathFor, normalizeImportedAssetPath, resolveAssetImportPath };
