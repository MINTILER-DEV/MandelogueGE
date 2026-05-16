import type { EditorEvent, EditorService } from "@mge/editor-core";
import type { MGECManifest, MGECModule, MGEProjectManifest } from "@mge/kernel";

export interface ProjectLockfile {
  packages: Record<
    string,
    {
      resolved: string;
      source: "workspace";
      version: string;
    }
  >;
}

export interface ProjectService {
  getLockfile(): ProjectLockfile;
  getManifest(): MGEProjectManifest;
  syncLockfile(): void;
}

const LOCKFILE_PATH = ".mgelock.json";
const PROJECT_FILE_PATH = ".mgeproject.json";

const projectModule: MGECModule = {
  id: "@mge/project",

  setup(ctx) {
    const editor = ctx.services.require<EditorService>("editor");
    const workspaceManifests = ctx.services.has("host:workspace-component-manifests")
      ? ctx.services.require<MGECManifest[]>("host:workspace-component-manifests")
      : [];
    let syncing = false;

    const project: ProjectService = {
      getLockfile() {
        return buildLockfile(project.getManifest(), workspaceManifests);
      },
      getManifest() {
        const file = editor.getProjectFile(PROJECT_FILE_PATH);

        if (!file) {
          throw new Error(`Project file "${PROJECT_FILE_PATH}" is missing.`);
        }

        return JSON.parse(file.content) as MGEProjectManifest;
      },
      syncLockfile() {
        if (syncing) {
          return;
        }

        const nextContent = `${JSON.stringify(project.getLockfile(), null, 2)}\n`;
        const current = editor.getProjectFile(LOCKFILE_PATH);

        if (current?.content === nextContent) {
          return;
        }

        syncing = true;
        editor.updateProjectFile(LOCKFILE_PATH, nextContent, {
          kind: "lockfile",
          select: false
        });
        syncing = false;
      }
    };

    editor.subscribe((event: EditorEvent) => {
      if (event.type === "files-changed" || event.type === "project-opened" || event.type === "project-saved") {
        project.syncLockfile();
      }
    });

    project.syncLockfile();
    ctx.services.provide("project", project, ctx.component.id);
    ctx.log.info("Registered project manifest and lockfile management.");
  }
};

function buildLockfile(project: MGEProjectManifest, manifests: readonly MGECManifest[]): ProjectLockfile {
  const manifestById = new Map(manifests.map((manifest) => [manifest.id, manifest]));

  return {
    packages: Object.fromEntries(
      Object.entries(project.components)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([componentId, requestedRange]) => {
          const manifest = manifestById.get(componentId);

          return [
            componentId,
            {
              resolved: requestedRange,
              source: "workspace" as const,
              version: manifest?.version ?? requestedRange
            }
          ];
        })
    )
  };
}

export default projectModule;
export { buildLockfile };
