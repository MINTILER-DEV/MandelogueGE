import path from "node:path";
import { fileURLToPath } from "node:url";

import { MGEKernel } from "@mge/kernel";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, "..");
const projectFile = path.join(workspaceRoot, "examples", "kernel-proof", ".mgeproject.json");

const kernel = new MGEKernel({
  emitDiagnosticsToConsole: true,
  projectFile,
  workspaceRoot
});

await kernel.boot();
await kernel.run();

const exampleService = kernel.services.require<{
  bootOrder: string[];
  coreVersion: string;
  started: boolean;
}>("example");

console.info("");
console.info("Kernel proof summary");
console.info(`Resolved order: ${kernel.resolvedOrder.join(" -> ")}`);
console.info(`Example service boot order: ${exampleService.bootOrder.join(" -> ")}`);
console.info(`Extensions: ${kernel.extensions.types().join(", ") || "none"}`);

await kernel.dispose();
