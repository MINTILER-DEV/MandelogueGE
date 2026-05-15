import projectManifest from "../project/.mgeproject.json" with { type: "json" };
import workspaceManifest from "../project/.mgeworkspace.json" with { type: "json" };
import coreManifest from "../../../packages/core/.mgec.json" with { type: "json" };
import demoSquareManifest from "../../../packages/demo-square/.mgec.json" with { type: "json" };
import ecsManifest from "../../../packages/ecs/.mgec.json" with { type: "json" };
import editorAssetsManifest from "../../../packages/editor-assets/.mgec.json" with { type: "json" };
import editorConsoleManifest from "../../../packages/editor-console/.mgec.json" with { type: "json" };
import editorCoreManifest from "../../../packages/editor-core/.mgec.json" with { type: "json" };
import editorHierarchyManifest from "../../../packages/editor-hierarchy/.mgec.json" with { type: "json" };
import editorInspectorManifest from "../../../packages/editor-inspector/.mgec.json" with { type: "json" };
import editorViewportManifest from "../../../packages/editor-viewport/.mgec.json" with { type: "json" };
import inputManifest from "../../../packages/input/.mgec.json" with { type: "json" };
import mgengineuiManifest from "../../../packages/mgengineui/.mgec.json" with { type: "json" };
import rendererManifest from "../../../packages/renderer-canvas2d/.mgec.json" with { type: "json" };
import sceneManifest from "../../../packages/scene/.mgec.json" with { type: "json" };
import scriptingManifest from "../../../packages/scripting-ts/.mgec.json" with { type: "json" };
import timeManifest from "../../../packages/time/.mgec.json" with { type: "json" };
import { default as coreModule, createBrowserFrameDriver, type RuntimeFrameDriver } from "@mge/core";
import demoSquareModule from "@mge/demo-square";
import editorAssetsModule from "@mge/editor-assets";
import editorConsoleModule from "@mge/editor-console";
import editorCoreModule, { type EditorProjectFile } from "@mge/editor-core";
import editorHierarchyModule from "@mge/editor-hierarchy";
import editorInspectorModule from "@mge/editor-inspector";
import editorViewportModule from "@mge/editor-viewport";
import ecsModule from "@mge/ecs";
import inputModule from "@mge/input";
import { MGEKernel, type MGEComponentSource, type MGECManifest, type MGEKernelDiagnostic, type MGEProjectManifest } from "@mge/kernel";
import mgengineuiModule from "@mge/mgengineui";
import rendererModule, { type CanvasHost } from "@mge/renderer-canvas2d";
import sceneModule from "@mge/scene";
import scriptingModule from "@mge/scripting-ts";
import timeModule from "@mge/time";
import PlayerController from "../project/scripts/PlayerController.js";
import playerControllerSource from "../project/scripts/PlayerController.ts?raw";

const canvas = document.querySelector<HTMLCanvasElement>("[data-mge-editor-canvas]");
const root = document.querySelector<HTMLElement>("[data-mge-root]");

if (!canvas || !root) {
  throw new Error("Editor app could not find the root host or viewport canvas.");
}

const editorCanvas = canvas;
const editorRoot = root;

editorCanvas.style.display = "block";
editorCanvas.style.height = "100%";
editorCanvas.style.width = "100%";

function manifest(value: unknown): MGECManifest {
  return value as MGECManifest;
}

const diagnostics: MGEKernelDiagnostic[] = [];
const workspaceComponents: MGEComponentSource[] = [
  { manifest: manifest(coreManifest), module: coreModule },
  { manifest: manifest(timeManifest), module: timeModule },
  { manifest: manifest(sceneManifest), module: sceneModule },
  { manifest: manifest(ecsManifest), module: ecsModule },
  { manifest: manifest(inputManifest), module: inputModule },
  { manifest: manifest(scriptingManifest), module: scriptingModule },
  { manifest: manifest(rendererManifest), module: rendererModule },
  { manifest: manifest(demoSquareManifest), module: demoSquareModule },
  { manifest: manifest(mgengineuiManifest), module: mgengineuiModule },
  { manifest: manifest(editorCoreManifest), module: editorCoreModule },
  { manifest: manifest(editorViewportManifest), module: editorViewportModule },
  { manifest: manifest(editorHierarchyManifest), module: editorHierarchyModule },
  { manifest: manifest(editorInspectorManifest), module: editorInspectorModule },
  { manifest: manifest(editorConsoleManifest), module: editorConsoleModule },
  { manifest: manifest(editorAssetsManifest), module: editorAssetsModule }
];

const projectFiles: EditorProjectFile[] = [
  {
    content: JSON.stringify(projectManifest, null, 2),
    kind: "config",
    path: ".mgeproject.json"
  },
  {
    content: `${JSON.stringify(workspaceManifest, null, 2)}\n`,
    kind: "workspace",
    path: ".mgeworkspace.json"
  },
  {
    content: playerControllerSource,
    kind: "script",
    path: "./scripts/PlayerController.ts"
  }
];

async function main(): Promise<void> {
  const kernel = new MGEKernel({
    diagnosticSink(entry) {
      diagnostics.push(entry);
    },
    emitDiagnosticsToConsole: true,
    initialServices: {
      "host:canvas": {
        canvas: editorCanvas,
        clearColor: "#0f1117"
      } satisfies CanvasHost,
      "host:editor-diagnostics": diagnostics,
      "host:frame-driver": createBrowserFrameDriver() satisfies RuntimeFrameDriver,
      "host:keyboard-target": window,
      "host:project-files": projectFiles,
      "host:project-storage": window.localStorage,
      "host:root": editorRoot,
      "host:script-sources": {
        "./scripts/PlayerController.ts": PlayerController
      },
      "host:viewport-canvas": editorCanvas
    },
    projectManifest: projectManifest as MGEProjectManifest,
    workspaceComponents
  });

  await kernel.boot();
}

void main();
