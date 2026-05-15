import satisfies from "semver/functions/satisfies.js";
import { z } from "zod";

export type MGECTarget = "runtime" | "editor" | "cloud" | "tooling";
export type MGELogLevel = "info" | "warn" | "error";
export type MGECPhase = "resolve" | "load" | "setup" | "start" | "run" | "dispose";

export interface MGEProjectManifest {
  name: string;
  type: string;
  engine: string;
  components: Record<string, string>;
  mainScene?: string;
}

export interface MGECManifest {
  id: string;
  name: string;
  version: string;
  entry: string;
  targets: MGECTarget[];
  requires?: Record<string, string>;
  requiresFeatures?: string[];
  providesFeatures?: string[];
  permissions?: string[];
  mge?: string;
}

export interface MGEKernelDiagnostic {
  code: string;
  componentId?: string;
  level: MGELogLevel;
  message: string;
}

export interface MGEKernelContext {
  component: MGECManifest;
  diagnostics: readonly MGEKernelDiagnostic[];
  extensions: ExtensionRegistry;
  features: FeatureRegistry;
  kernel: {
    readonly projectFile: string;
    readonly resolvedOrder: readonly string[];
    readonly workspaceRoot: string;
  };
  log: ComponentLogger;
  paths: {
    readonly componentRoot: string;
    readonly manifestFile: string;
    readonly projectFile: string;
    readonly workspaceRoot: string;
  };
  project: MGEProjectManifest;
  services: ServiceRegistry;
}

export interface MGECModule {
  dispose?(ctx: MGEKernelContext): Promise<void> | void;
  id?: string;
  load?(ctx: MGEKernelContext): Promise<void> | void;
  resolve?(ctx: MGEKernelContext): Promise<void> | void;
  run?(ctx: MGEKernelContext): Promise<void> | void;
  setup?(ctx: MGEKernelContext): Promise<void> | void;
  start?(ctx: MGEKernelContext): Promise<void> | void;
}

export interface MGEKernelOptions {
  diagnosticSink?: (diagnostic: MGEKernelDiagnostic) => void;
  emitDiagnosticsToConsole?: boolean;
  initialServices?: Record<string, unknown>;
  manifestNames?: string[];
  projectFile?: string;
  projectManifest?: MGEProjectManifest;
  workspaceComponents?: MGEComponentSource[];
  workspaceRoot?: string;
}

export interface MGEWorkspaceComponent {
  loadModule?: () => Promise<MGECModule> | MGECModule;
  manifest: MGECManifest;
  manifestFile: string;
  module?: MGECModule;
  packageRoot: string;
}

export interface MGEComponentSource {
  loadModule?: () => Promise<MGECModule> | MGECModule;
  manifest: MGECManifest;
  manifestFile?: string;
  module?: MGECModule;
  packageRoot?: string;
}

export interface MGEProjectResolution {
  components: readonly MGEWorkspaceComponent[];
  featureProviders: ReadonlyMap<string, readonly string[]>;
  project: MGEProjectManifest;
  requestedComponents: ReadonlyMap<string, readonly string[]>;
}

const projectManifestSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  engine: z.string().min(1),
  components: z.record(z.string().min(1)),
  mainScene: z.string().min(1).optional()
});

const mgecManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  entry: z.string().min(1),
  targets: z.array(z.enum(["runtime", "editor", "cloud", "tooling"])).min(1),
  requires: z.record(z.string().min(1)).optional(),
  requiresFeatures: z.array(z.string().min(1)).optional(),
  providesFeatures: z.array(z.string().min(1)).optional(),
  permissions: z.array(z.string().min(1)).optional(),
  mge: z.string().min(1).optional()
});

type ReadFileModule = {
  readFile(filePath: string, encoding: "utf8"): Promise<string>;
};

type ReaddirModule = {
  readdir(
    rootDir: string,
    options: { withFileTypes: true }
  ): Promise<Array<{ isDirectory(): boolean; name: string }>>;
};

type PathModule = {
  dirname(filePath: string): string;
  join(...parts: string[]): string;
  resolve(...parts: string[]): string;
};

type UrlModule = {
  pathToFileURL(filePath: string): { href: string };
};

const dynamicImport = (specifier: string): Promise<unknown> => import(specifier);

export class ServiceRegistry {
  #owners = new Map<string, string>();
  #services = new Map<string, unknown>();

  provide(id: string, value: unknown, owner = "unknown"): void {
    if (this.#services.has(id)) {
      const currentOwner = this.#owners.get(id) ?? "unknown";
      throw new Error(`Service "${id}" is already provided by ${currentOwner}.`);
    }

    this.#owners.set(id, owner);
    this.#services.set(id, value);
  }

  require<T>(id: string): T {
    if (!this.#services.has(id)) {
      throw new Error(`Required service "${id}" has not been provided.`);
    }

    return this.#services.get(id) as T;
  }

  has(id: string): boolean {
    return this.#services.has(id);
  }

  list(): string[] {
    return [...this.#services.keys()];
  }
}

export class FeatureRegistry {
  #features = new Map<string, { providers: Set<string>; version: string }>();

  provide(id: string, version: string, owner = "unknown"): void {
    const existing = this.#features.get(id);

    if (existing) {
      existing.providers.add(owner);
      return;
    }

    this.#features.set(id, {
      providers: new Set([owner]),
      version
    });
  }

  require(id: string): void {
    if (!this.#features.has(id)) {
      throw new Error(`Required feature "${id}" has not been provided.`);
    }
  }

  has(id: string): boolean {
    return this.#features.has(id);
  }

  list(): Array<{ id: string; providers: string[]; version: string }> {
    return [...this.#features.entries()].map(([id, value]) => ({
      id,
      providers: [...value.providers],
      version: value.version
    }));
  }

  providersFor(id: string): string[] {
    return [...(this.#features.get(id)?.providers ?? [])];
  }
}

export class ExtensionRegistry {
  #extensions = new Map<string, unknown[]>();

  register(type: string, item: unknown): void {
    const existing = this.#extensions.get(type) ?? [];
    existing.push(item);
    this.#extensions.set(type, existing);
  }

  get<T>(type: string): T[] {
    return (this.#extensions.get(type) ?? []) as T[];
  }

  types(): string[] {
    return [...this.#extensions.keys()];
  }
}

export class ComponentLogger {
  readonly #componentId: string;
  readonly #sink: (diagnostic: MGEKernelDiagnostic) => void;

  constructor(componentId: string, sink: (diagnostic: MGEKernelDiagnostic) => void) {
    this.#componentId = componentId;
    this.#sink = sink;
  }

  info(message: string): void {
    this.#emit("info", message);
  }

  warn(message: string): void {
    this.#emit("warn", message);
  }

  error(message: string): void {
    this.#emit("error", message);
  }

  #emit(level: MGELogLevel, message: string): void {
    this.#sink({
      code: `component.${level}`,
      componentId: this.#componentId,
      level,
      message
    });
  }
}

type LoadedComponent = {
  context: MGEKernelContext;
  definition: MGEWorkspaceComponent;
  module: MGECModule;
};

export class MGEKernel {
  readonly #componentMap = new Map<string, LoadedComponent>();
  readonly #diagnostics: MGEKernelDiagnostic[] = [];
  readonly #extensions = new ExtensionRegistry();
  readonly #features = new FeatureRegistry();
  readonly #manifestNames: string[];
  readonly #options: MGEKernelOptions;
  readonly #services = new ServiceRegistry();
  #disposed = false;
  #resolution: MGEProjectResolution | null = null;

  constructor(options: MGEKernelOptions) {
    this.#options = options;
    this.#manifestNames = options.manifestNames ?? [".mgec.json", "mgec.json"];

    for (const [serviceId, serviceValue] of Object.entries(options.initialServices ?? {})) {
      this.#services.provide(serviceId, serviceValue, "kernel");
    }
  }

  get diagnostics(): readonly MGEKernelDiagnostic[] {
    return this.#diagnostics;
  }

  get extensions(): ExtensionRegistry {
    return this.#extensions;
  }

  get features(): FeatureRegistry {
    return this.#features;
  }

  get project(): MGEProjectManifest | null {
    return this.#resolution?.project ?? null;
  }

  get resolution(): MGEProjectResolution | null {
    return this.#resolution;
  }

  get resolvedOrder(): readonly string[] {
    return this.#resolution?.components.map((component) => component.manifest.id) ?? [];
  }

  get services(): ServiceRegistry {
    return this.#services;
  }

  async resolveProject(): Promise<MGEProjectResolution> {
    const project = await this.#getProjectManifest();
    const workspace = await this.#scanWorkspace();
    const orderedIds: string[] = [];
    const requestedComponents = new Map<string, string[]>();
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (componentId: string, versionRange: string, ancestry: string[]): void => {
      const definition = workspace.get(componentId);

      if (!definition) {
        throw new Error(`Component "${componentId}" is declared but no workspace manifest was found.`);
      }

      if (!satisfies(definition.manifest.version, versionRange, { includePrerelease: true })) {
        throw new Error(
          `Component "${componentId}" resolved to version ${definition.manifest.version}, which does not satisfy ${versionRange}.`
        );
      }

      const ranges = requestedComponents.get(componentId) ?? [];
      ranges.push(versionRange);
      requestedComponents.set(componentId, ranges);

      if (visited.has(componentId)) {
        return;
      }

      if (visiting.has(componentId)) {
        const cycle = [...ancestry, componentId].join(" -> ");
        throw new Error(`Dependency cycle detected: ${cycle}`);
      }

      visiting.add(componentId);

      for (const [dependencyId, dependencyRange] of Object.entries(definition.manifest.requires ?? {})) {
        visit(dependencyId, dependencyRange, [...ancestry, componentId]);
      }

      visiting.delete(componentId);
      visited.add(componentId);
      orderedIds.push(componentId);
    };

    for (const [componentId, versionRange] of Object.entries(project.components)) {
      visit(componentId, versionRange, []);
    }

    const orderedComponents = orderedIds.map((componentId) => workspace.get(componentId) as MGEWorkspaceComponent);
    const featureProviders = new Map<string, string[]>();

    for (const component of orderedComponents) {
      for (const featureId of component.manifest.providesFeatures ?? []) {
        const providers = featureProviders.get(featureId) ?? [];
        providers.push(component.manifest.id);
        featureProviders.set(featureId, providers);
      }
    }

    for (const component of orderedComponents) {
      for (const requiredFeature of component.manifest.requiresFeatures ?? []) {
        if (!featureProviders.has(requiredFeature)) {
          throw new Error(
            `Component "${component.manifest.id}" requires feature "${requiredFeature}", but no resolved component provides it.`
          );
        }
      }
    }

    this.#resolution = {
      components: orderedComponents,
      featureProviders,
      project,
      requestedComponents
    };

    this.#diagnose("info", "project.resolved", `Resolved ${orderedComponents.length} MGEC(s): ${this.resolvedOrder.join(" -> ")}`);

    return this.#resolution;
  }

  async loadModules(): Promise<void> {
    const resolution = this.#resolution ?? (await this.resolveProject());

    for (const component of resolution.components) {
      for (const featureId of component.manifest.providesFeatures ?? []) {
        this.#features.provide(featureId, component.manifest.version, component.manifest.id);
      }
    }

    for (const component of resolution.components) {
      const moduleDefinition = this.#normalizeModuleDefinition(await this.#loadModuleDefinition(component));

      if (moduleDefinition.id && moduleDefinition.id !== component.manifest.id) {
        throw new Error(
          `Entry module at ${component.manifest.entry} declares id "${moduleDefinition.id}", expected "${component.manifest.id}".`
        );
      }

      const logger = new ComponentLogger(component.manifest.id, (diagnostic) => this.#consumeDiagnostic(diagnostic));
      const context: MGEKernelContext = {
        component: component.manifest,
        diagnostics: this.#diagnostics,
        extensions: this.#extensions,
        features: this.#features,
        kernel: {
          projectFile: this.#options.projectFile ?? "virtual://project/.mgeproject.json",
          resolvedOrder: this.resolvedOrder,
          workspaceRoot: this.#options.workspaceRoot ?? "virtual://workspace"
        },
        log: logger,
        paths: {
          componentRoot: component.packageRoot,
          manifestFile: component.manifestFile,
          projectFile: this.#options.projectFile ?? "virtual://project/.mgeproject.json",
          workspaceRoot: this.#options.workspaceRoot ?? "virtual://workspace"
        },
        project: resolution.project,
        services: this.#services
      };

      this.#componentMap.set(component.manifest.id, {
        context,
        definition: component,
        module: moduleDefinition
      });
    }
  }

  async boot(): Promise<void> {
    await this.resolveProject();
    await this.loadModules();
    await this.runPhase("resolve");
    await this.runPhase("load");
    await this.runPhase("setup");
    await this.runPhase("start");
  }

  async dispose(): Promise<void> {
    if (this.#disposed) {
      return;
    }

    this.#disposed = true;
    await this.runPhase("dispose");
  }

  async run(): Promise<void> {
    await this.runPhase("run");
  }

  async runPhase(phase: MGECPhase): Promise<void> {
    const components = this.#orderedLoadedComponents(phase === "dispose");

    if (components.length === 0) {
      throw new Error(`Cannot run phase "${phase}" before modules are loaded.`);
    }

    this.#diagnose("info", `phase.${phase}`, `Running phase "${phase}" for ${components.length} MGEC(s).`);

    for (const component of components) {
      const hook = component.module[phase];

      if (typeof hook === "function") {
        await hook(component.context);
      }
    }
  }

  #consumeDiagnostic(diagnostic: MGEKernelDiagnostic): void {
    this.#diagnostics.push(diagnostic);
    this.#options.diagnosticSink?.(diagnostic);

    if (!this.#options.emitDiagnosticsToConsole) {
      return;
    }

    const prefix = diagnostic.componentId ? `[${diagnostic.componentId}]` : "[kernel]";
    const message = `${prefix} ${diagnostic.message}`;

    if (diagnostic.level === "warn") {
      console.warn(message);
      return;
    }

    if (diagnostic.level === "error") {
      console.error(message);
      return;
    }

    console.info(message);
  }

  #diagnose(level: MGELogLevel, code: string, message: string): void {
    this.#consumeDiagnostic({ code, level, message });
  }

  async #readManifest<T>(filePath: string, schema: z.ZodType<T>): Promise<T> {
    const { readFile } = (await dynamicImport("node:fs/promises")) as ReadFileModule;
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return schema.parse(parsed);
  }

  async #getProjectManifest(): Promise<MGEProjectManifest> {
    if (this.#options.projectManifest) {
      return projectManifestSchema.parse(this.#options.projectManifest);
    }

    if (!this.#options.projectFile) {
      throw new Error("Kernel options must provide either projectManifest or projectFile.");
    }

    return this.#readManifest(this.#options.projectFile, projectManifestSchema);
  }

  async #loadModuleDefinition(component: MGEWorkspaceComponent): Promise<unknown> {
    if (component.module) {
      return component.module;
    }

    if (component.loadModule) {
      return component.loadModule();
    }

    const pathModule = (await dynamicImport("node:path")) as PathModule;
    const { pathToFileURL } = (await dynamicImport("node:url")) as UrlModule;
    const moduleUrl = pathToFileURL(pathModule.resolve(component.packageRoot, component.manifest.entry)).href;
    const imported = (await import(moduleUrl)) as { default?: unknown };
    return imported.default ?? imported;
  }

  #normalizeModuleDefinition(candidate: unknown): MGECModule {
    if (!candidate || typeof candidate !== "object") {
      throw new Error("MGEC entry module must export an object as its default export.");
    }

    return candidate as MGECModule;
  }

  async #scanWorkspace(): Promise<Map<string, MGEWorkspaceComponent>> {
    if (this.#options.workspaceComponents) {
      const componentMap = new Map<string, MGEWorkspaceComponent>();

      for (const source of this.#options.workspaceComponents) {
        const manifest = mgecManifestSchema.parse(source.manifest);
        const normalized = this.#normalizeWorkspaceComponent(source, manifest);

        if (componentMap.has(manifest.id)) {
          throw new Error(`Duplicate MGEC id "${manifest.id}" detected in provided workspace components.`);
        }

        componentMap.set(manifest.id, normalized);
      }

      return componentMap;
    }

    if (!this.#options.workspaceRoot) {
      throw new Error("Kernel options must provide either workspaceComponents or workspaceRoot.");
    }

    const manifests = await this.#findManifestFiles(this.#options.workspaceRoot);
    const componentMap = new Map<string, MGEWorkspaceComponent>();

    for (const manifestFile of manifests) {
      const manifest = await this.#readManifest(manifestFile, mgecManifestSchema);
      const normalized = this.#normalizeWorkspaceComponent(
        {
          manifest,
          manifestFile,
          packageRoot: ((await dynamicImport("node:path")) as PathModule).dirname(manifestFile)
        },
        manifest
      );

      if (componentMap.has(normalized.manifest.id)) {
        throw new Error(`Duplicate MGEC id "${manifest.id}" detected at ${manifestFile}.`);
      }

      componentMap.set(normalized.manifest.id, normalized);
    }

    return componentMap;
  }

  #normalizeWorkspaceComponent(source: MGEComponentSource, manifest: MGECManifest): MGEWorkspaceComponent {
    const packageRoot = source.packageRoot ?? `virtual://components/${encodeURIComponent(manifest.id)}`;
    const manifestFile = source.manifestFile ?? `${packageRoot}/.mgec.json`;

    return {
      loadModule: source.loadModule,
      manifest,
      manifestFile,
      module: source.module,
      packageRoot
    };
  }

  async #findManifestFiles(rootDir: string): Promise<string[]> {
    const { readdir } = (await dynamicImport("node:fs/promises")) as ReaddirModule;
    const pathModule = (await dynamicImport("node:path")) as PathModule;
    const results: string[] = [];

    const walk = async (currentDir: string): Promise<void> => {
      const entries = await readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (entry.name === ".git" || entry.name === "dist" || entry.name === "node_modules") {
            continue;
          }

          await walk(pathModule.join(currentDir, entry.name));
          continue;
        }

        if (this.#manifestNames.includes(entry.name)) {
          results.push(pathModule.join(currentDir, entry.name));
        }
      }
    };

    await walk(rootDir);

    return results;
  }

  #orderedLoadedComponents(reverse = false): LoadedComponent[] {
    const ordered = this.resolvedOrder.map((componentId) => {
      const component = this.#componentMap.get(componentId);

      if (!component) {
        throw new Error(`Component "${componentId}" was resolved but never loaded.`);
      }

      return component;
    });

    return reverse ? [...ordered].reverse() : ordered;
  }
}

export const schemas = {
  mgecManifestSchema,
  projectManifestSchema
};
