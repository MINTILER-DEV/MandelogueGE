import projectManifest from "../project/.mgeproject.json" with { type: "json" };
import coreManifest from "../../../packages/core/.mgec.json" with { type: "json" };
import demoSquareManifest from "../../../packages/demo-square/.mgec.json" with { type: "json" };
import ecsManifest from "../../../packages/ecs/.mgec.json" with { type: "json" };
import inputManifest from "../../../packages/input/.mgec.json" with { type: "json" };
import kernelManifest from "../../../packages/kernel/package.json" with { type: "json" };
import rendererManifest from "../../../packages/renderer-canvas2d/.mgec.json" with { type: "json" };
import sceneManifest from "../../../packages/scene/.mgec.json" with { type: "json" };
import scriptingManifest from "../../../packages/scripting-ts/.mgec.json" with { type: "json" };
import timeManifest from "../../../packages/time/.mgec.json" with { type: "json" };
import { default as coreModule, createBrowserFrameDriver, type RuntimeFrameDriver } from "@mge/core";
import demoSquareModule from "@mge/demo-square";
import ecsModule from "@mge/ecs";
import inputModule from "@mge/input";
import { MGEKernel, type MGEComponentSource, type MGECManifest, type MGEProjectManifest } from "@mge/kernel";
import rendererModule, { type CanvasHost } from "@mge/renderer-canvas2d";
import sceneModule from "@mge/scene";
import scriptingModule from "@mge/scripting-ts";
import "./style.css";
import timeModule from "@mge/time";
import PlayerController from "../project/scripts/PlayerController.js";

const canvas = document.querySelector<HTMLCanvasElement>("[data-mge-canvas]");

if (!canvas) {
  throw new Error("Runtime proof could not find the demo canvas.");
}

const runtimeCanvas = canvas;

function manifest(value: unknown): MGECManifest {
  return value as MGECManifest;
}

const workspaceComponents: MGEComponentSource[] = [
  { manifest: manifest(coreManifest), module: coreModule },
  { manifest: manifest(timeManifest), module: timeModule },
  { manifest: manifest(sceneManifest), module: sceneModule },
  { manifest: manifest(ecsManifest), module: ecsModule },
  { manifest: manifest(inputManifest), module: inputModule },
  { manifest: manifest(scriptingManifest), module: scriptingModule },
  { manifest: manifest(rendererManifest), module: rendererModule },
  { manifest: manifest(demoSquareManifest), module: demoSquareModule }
];

async function main(): Promise<void> {
  const kernel = new MGEKernel({
    emitDiagnosticsToConsole: true,
    initialServices: {
      "host:canvas": {
        canvas: runtimeCanvas,
        clearColor: "#0f1117"
      } satisfies CanvasHost,
      "host:frame-driver": createBrowserFrameDriver() satisfies RuntimeFrameDriver,
      "host:script-sources": {
        "./scripts/PlayerController.ts": PlayerController
      },
      "host:keyboard-target": window
    },
    projectManifest: projectManifest as MGEProjectManifest,
    workspaceComponents
  });

  await kernel.boot();
  await kernel.run();

  console.info(
    `Runtime proof booted with ${workspaceComponents.length} MGECs on MGE kernel ${kernelManifest.version}.`
  );

  window.addEventListener("beforeunload", () => {
    void kernel.dispose();
  });
}

void main();
