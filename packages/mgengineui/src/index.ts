import type { MGECModule } from "@mge/kernel";

export type PanelZone = "left" | "center" | "right" | "bottom";
export type PropertyRowKind = "text" | "number" | "boolean" | "textarea";

export interface MGEngineUIButtonDefinition {
  label: string;
  onClick(): void;
  title?: string;
  variant?: "accent" | "ghost" | "subtle";
}

export interface MGEngineUIBranding {
  subtitle?: string;
  title: string;
}

export interface MGEngineUICommandDefinition {
  id: string;
  keywords?: string[];
  run(): void;
  title: string;
  toolbar?: boolean;
}

export interface MGEngineUIMenuItem {
  action(): void;
  label: string;
}

export interface MGEngineUIMenuDefinition {
  id: string;
  items: MGEngineUIMenuItem[];
  label: string;
}

export interface MGEngineUIModalDefinition {
  render(ui: MGEngineUIService): HTMLElement;
  title: string;
}

export interface MGEngineUIPanelDefinition {
  id: string;
  order?: number;
  render(ui: MGEngineUIService): HTMLElement;
  title: string;
  zone?: PanelZone;
}

export interface MGEngineUIPropertyRowDefinition {
  kind: PropertyRowKind;
  label: string;
  onChange?(value: boolean | number | string): void;
  readOnly?: boolean;
  value: boolean | number | string;
}

export interface MGEngineUITreeNode {
  children?: MGEngineUITreeNode[];
  label: string;
  onSelect?(): void;
  selected?: boolean;
  trailing?: string;
}

export interface MGEngineUIService {
  button: {
    create(definition: MGEngineUIButtonDefinition): HTMLButtonElement;
  };
  commands: {
    closePalette(): void;
    list(): MGEngineUICommandDefinition[];
    openPalette(): void;
    register(command: MGEngineUICommandDefinition): void;
  };
  invalidate(): void;
  menus: {
    list(): MGEngineUIMenuDefinition[];
    register(menu: MGEngineUIMenuDefinition): void;
  };
  modal: {
    close(): void;
    open(definition: MGEngineUIModalDefinition): void;
  };
  mount(): void;
  panels: {
    applyLayout(layout: Partial<Record<PanelZone, string[]>>): void;
    getLayout(): Record<PanelZone, string[]>;
    list(): MGEngineUIPanelDefinition[];
    move(panelId: string, zone: PanelZone): void;
    register(panel: MGEngineUIPanelDefinition): void;
    setActive(panelId: string): void;
  };
  propertyGrid: {
    render(rows: MGEngineUIPropertyRowDefinition[]): HTMLElement;
  };
  setBranding(branding: MGEngineUIBranding): void;
  setStatus(status: string): void;
  tree: {
    render(nodes: MGEngineUITreeNode[]): HTMLElement;
  };
}

const STYLE_ID = "mge-mgengineui-styles";
const DEFAULT_LAYOUT: Record<PanelZone, string[]> = {
  bottom: [],
  center: [],
  left: [],
  right: []
};
const DEFAULT_PANEL_SIZES = {
  bottom: 180,
  left: 248,
  right: 300
} as const;
const MIN_BOTTOM_PANEL_SIZE = 120;
const MIN_CENTER_PANEL_SIZE = 360;
const MIN_SIDE_PANEL_SIZE = 180;
const MIN_TOP_PANEL_SIZE = 240;

const mgengineuiModule: MGECModule = {
  id: "@mge/mgengineui",

  setup(ctx) {
    const root = ctx.services.has("host:root")
      ? ctx.services.require<HTMLElement>("host:root")
      : resolveRoot();
    const ui = createMGEngineUI(root);

    ctx.services.provide("mgengineui", ui, ctx.component.id);
    ctx.log.info("Registered MGEngineUI.");
  }
};

function createMGEngineUI(root: HTMLElement): MGEngineUIService {
  let branding: MGEngineUIBranding = {
    subtitle: "Component-built editor shell",
    title: "MGEngineUI"
  };
  let mounted = false;
  let openMenuId: string | null = null;
  let paletteOpen = false;
  let paletteQuery = "";
  let modalDefinition: MGEngineUIModalDefinition | null = null;
  let statusText = "Idle";
  const panelSizes: Record<keyof typeof DEFAULT_PANEL_SIZES, number> = { ...DEFAULT_PANEL_SIZES };
  const commands = new Map<string, MGEngineUICommandDefinition>();
  const layout = structuredClone(DEFAULT_LAYOUT);
  const activeByZone: Record<PanelZone, string | null> = {
    bottom: null,
    center: null,
    left: null,
    right: null
  };
  const menus = new Map<string, MGEngineUIMenuDefinition>();
  const panels = new Map<string, MGEngineUIPanelDefinition>();

  const ui: MGEngineUIService = {
    button: {
      create(definition) {
        const button = document.createElement("button");
        button.className = `mge-ui-button mge-ui-button--${definition.variant ?? "subtle"}`;
        button.textContent = definition.label;
        button.title = definition.title ?? definition.label;
        button.addEventListener("click", definition.onClick);
        return button;
      }
    },
    commands: {
      closePalette() {
        paletteOpen = false;
        paletteQuery = "";
        ui.invalidate();
      },
      list() {
        return [...commands.values()];
      },
      openPalette() {
        paletteOpen = true;
        ui.invalidate();
      },
      register(command) {
        commands.set(command.id, command);
      }
    },
    invalidate() {
      if (mounted) {
        render();
      }
    },
    menus: {
      list() {
        return [...menus.values()];
      },
      register(menu) {
        menus.set(menu.id, menu);
      }
    },
    modal: {
      close() {
        modalDefinition = null;
        ui.invalidate();
      },
      open(definition) {
        modalDefinition = definition;
        ui.invalidate();
      }
    },
    mount() {
      mounted = true;
      ensureStyles(root.ownerDocument);
      render();
    },
    panels: {
      applyLayout(nextLayout) {
        for (const zone of Object.keys(DEFAULT_LAYOUT) as PanelZone[]) {
          const filtered = (nextLayout[zone] ?? []).filter((panelId) => panels.has(panelId));
          const missing = [...panels.values()]
            .filter((panel) => (panel.zone ?? "center") === zone && !filtered.includes(panel.id))
            .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
            .map((panel) => panel.id);

          layout[zone] = [...filtered, ...missing];
          activeByZone[zone] = layout[zone][0] ?? null;
        }
      },
      getLayout() {
        return structuredClone(layout);
      },
      list() {
        return [...panels.values()].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
      },
      move(panelId, zone) {
        for (const currentZone of Object.keys(layout) as PanelZone[]) {
          layout[currentZone] = layout[currentZone].filter((candidate) => candidate !== panelId);
          if (activeByZone[currentZone] === panelId) {
            activeByZone[currentZone] = layout[currentZone][0] ?? null;
          }
        }

        layout[zone].push(panelId);
        activeByZone[zone] = panelId;
        ui.invalidate();
      },
      register(panel) {
        panels.set(panel.id, panel);
        const zone = panel.zone ?? "center";

        if (!layout[zone].includes(panel.id)) {
          layout[zone].push(panel.id);
        }

        if (!activeByZone[zone]) {
          activeByZone[zone] = panel.id;
        }
      },
      setActive(panelId) {
        const panel = panels.get(panelId);

        if (!panel) {
          return;
        }

        activeByZone[panel.zone ?? "center"] = panelId;
        ui.invalidate();
      }
    },
    propertyGrid: {
      render(rows) {
        const grid = document.createElement("div");
        grid.className = "mge-property-grid";

        if (rows.length === 0) {
          const empty = document.createElement("p");
          empty.className = "mge-empty";
          empty.textContent = "No editable properties.";
          grid.append(empty);
          return grid;
        }

        for (const row of rows) {
          const label = document.createElement("label");
          label.className = "mge-property-row";

          const name = document.createElement("span");
          name.className = "mge-property-row__label";
          name.textContent = row.label;
          label.append(name);

          const field = createPropertyField(row);
          label.append(field);
          grid.append(label);
        }

        return grid;
      }
    },
    setBranding(nextBranding) {
      branding = nextBranding;
      ui.invalidate();
    },
    setStatus(nextStatus) {
      statusText = nextStatus;
      ui.invalidate();
    },
    tree: {
      render(nodes) {
        const list = document.createElement("div");
        list.className = "mge-tree";

        if (nodes.length === 0) {
          const empty = document.createElement("p");
          empty.className = "mge-empty";
          empty.textContent = "Nothing here yet.";
          list.append(empty);
          return list;
        }

        for (const node of nodes) {
          list.append(renderTreeNode(node));
        }

        return list;
      }
    }
  };

  function render(): void {
    root.replaceChildren();

    const shell = document.createElement("div");
    shell.className = "mge-shell";
    shell.append(renderTopbar());
    shell.append(renderWorkspace());

    if (paletteOpen) {
      shell.append(renderCommandPalette());
    }

    if (modalDefinition) {
      shell.append(renderModal());
    }

    root.append(shell);
  }

  function renderCommandPalette(): HTMLElement {
    const overlay = document.createElement("div");
    overlay.className = "mge-overlay";
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        ui.commands.closePalette();
      }
    });

    const card = document.createElement("div");
    card.className = "mge-palette";

    const input = document.createElement("input");
    input.className = "mge-palette__input";
    input.placeholder = "Run command";
    input.value = paletteQuery;
    input.addEventListener("input", () => {
      paletteQuery = input.value;
      ui.invalidate();
    });
    card.append(input);

    const matches = ui.commands
      .list()
      .filter((command) => {
        const haystack = `${command.title} ${(command.keywords ?? []).join(" ")}`.toLowerCase();
        return haystack.includes(paletteQuery.toLowerCase());
      })
      .slice(0, 12);

    for (const command of matches) {
      const button = document.createElement("button");
      button.className = "mge-palette__item";
      button.textContent = command.title;
      button.addEventListener("click", () => {
        ui.commands.closePalette();
        command.run();
      });
      card.append(button);
    }

    overlay.append(card);

    queueMicrotask(() => input.focus());
    return overlay;
  }

  function renderModal(): HTMLElement {
    const overlay = document.createElement("div");
    overlay.className = "mge-overlay";
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        ui.modal.close();
      }
    });

    const card = document.createElement("div");
    card.className = "mge-modal";

    const header = document.createElement("div");
    header.className = "mge-modal__header";
    const title = document.createElement("h3");
    title.textContent = modalDefinition?.title ?? "Modal";
    header.append(title);
    header.append(
      ui.button.create({
        label: "Close",
        onClick: () => ui.modal.close(),
        variant: "ghost"
      })
    );

    card.append(header);

    if (modalDefinition) {
      card.append(modalDefinition.render(ui));
    }

    overlay.append(card);
    return overlay;
  }

  function renderPanel(zone: PanelZone): HTMLElement {
    const panelRoot = document.createElement("section");
    panelRoot.className = `mge-panel-zone mge-panel-zone--${zone}`;
    panelRoot.dataset.zone = zone;

    const panelIds = layout[zone].filter((panelId) => panels.has(panelId));

    if (panelIds.length === 0) {
      const empty = document.createElement("p");
      empty.className = "mge-empty";
      empty.textContent = "Empty zone";
      panelRoot.append(empty);
      return panelRoot;
    }

    const tabs = document.createElement("div");
    tabs.className = "mge-tabs";

    for (const panelId of panelIds) {
      const panel = panels.get(panelId) as MGEngineUIPanelDefinition;
      const button = document.createElement("button");
      button.className = panelId === activeByZone[zone] ? "mge-tab is-active" : "mge-tab";
      button.textContent = panel.title;
      button.addEventListener("click", () => ui.panels.setActive(panelId));
      tabs.append(button);
    }

    panelRoot.append(tabs);

    const activePanelId = activeByZone[zone] ?? panelIds[0] ?? null;
    const panel = activePanelId ? panels.get(activePanelId) : null;

    if (!panel) {
      return panelRoot;
    }

    const frame = document.createElement("div");
    frame.className = "mge-panel-frame";
    frame.dataset.panelId = panel.id;

    const header = document.createElement("div");
    header.className = "mge-panel-frame__header";
    const title = document.createElement("strong");
    title.textContent = panel.title;
    header.append(title);

    const dockSelect = document.createElement("select");
    dockSelect.className = "mge-dock-select";

    for (const option of Object.keys(DEFAULT_LAYOUT) as PanelZone[]) {
      const optionElement = document.createElement("option");
      optionElement.value = option;
      optionElement.textContent = `Dock ${option}`;
      optionElement.selected = option === zone;
      dockSelect.append(optionElement);
    }

    dockSelect.addEventListener("change", () => {
      ui.panels.move(panel.id, dockSelect.value as PanelZone);
    });
    header.append(dockSelect);
    frame.append(header);

    const content = document.createElement("div");
    content.className =
      panel.id === "viewport" ? "mge-panel-frame__content mge-panel-frame__content--viewport" : "mge-panel-frame__content";
    content.dataset.panelId = panel.id;
    content.append(panel.render(ui));
    frame.append(content);

    panelRoot.append(frame);
    return panelRoot;
  }

  function renderTopbar(): HTMLElement {
    const bar = document.createElement("header");
    bar.className = "mge-topbar";

    const brand = document.createElement("div");
    brand.className = "mge-brand";
    const title = document.createElement("strong");
    title.textContent = branding.title;
    const subtitle = document.createElement("span");
    subtitle.textContent = branding.subtitle ?? "";
    brand.append(title, subtitle);
    bar.append(brand);

    const menuRow = document.createElement("div");
    menuRow.className = "mge-menu-row";

    for (const menu of ui.menus.list()) {
      const wrapper = document.createElement("div");
      wrapper.className = "mge-menu";
      const trigger = document.createElement("button");
      trigger.className = "mge-menu__trigger";
      trigger.textContent = menu.label;
      trigger.addEventListener("click", () => {
        openMenuId = openMenuId === menu.id ? null : menu.id;
        ui.invalidate();
      });
      wrapper.append(trigger);

      if (openMenuId === menu.id) {
        const dropdown = document.createElement("div");
        dropdown.className = "mge-menu__dropdown";

        for (const item of menu.items) {
          const button = document.createElement("button");
          button.className = "mge-menu__item";
          button.textContent = item.label;
          button.addEventListener("click", () => {
            openMenuId = null;
            item.action();
          });
          dropdown.append(button);
        }

        wrapper.append(dropdown);
      }

      menuRow.append(wrapper);
    }

    bar.append(menuRow);

    const toolbar = document.createElement("div");
    toolbar.className = "mge-toolbar";

    for (const command of ui.commands.list().filter((candidate) => candidate.toolbar)) {
      toolbar.append(
        ui.button.create({
          label: command.title,
          onClick: command.run,
          variant: "ghost"
        })
      );
    }

    toolbar.append(
      ui.button.create({
        label: "Palette",
        onClick: () => ui.commands.openPalette(),
        variant: "accent"
      })
    );
    bar.append(toolbar);

    const status = document.createElement("div");
    status.className = "mge-status";
    status.textContent = statusText;
    bar.append(status);

    return bar;
  }

  function renderWorkspace(): HTMLElement {
    const workspace = document.createElement("main");
    workspace.className = "mge-workspace";
    applyWorkspaceSizes(workspace);
    workspace.append(
      renderPanel("left"),
      createResizeHandle("left", workspace),
      renderPanel("center"),
      createResizeHandle("right", workspace),
      renderPanel("right"),
      createResizeHandle("bottom", workspace),
      renderPanel("bottom")
    );
    return workspace;
  }

  function applyWorkspaceSizes(workspace: HTMLElement): void {
    workspace.style.setProperty("--mge-left-size", `${panelSizes.left}px`);
    workspace.style.setProperty("--mge-right-size", `${panelSizes.right}px`);
    workspace.style.setProperty("--mge-bottom-size", `${panelSizes.bottom}px`);
  }

  function createResizeHandle(zone: "bottom" | "left" | "right", workspace: HTMLElement): HTMLElement {
    const handle = document.createElement("div");
    handle.className = `mge-resize-handle mge-resize-handle--${zone}`;
    handle.addEventListener("pointerdown", (event) => startResize(zone, workspace, handle, event));
    return handle;
  }

  function startResize(
    zone: "bottom" | "left" | "right",
    workspace: HTMLElement,
    handle: HTMLElement,
    event: PointerEvent
  ): void {
    event.preventDefault();

    const documentRef = workspace.ownerDocument;
    const body = documentRef.body;

    handle.classList.add("is-dragging");
    body.classList.add(zone === "bottom" ? "mge-is-resizing-row" : "mge-is-resizing-col");

    const onPointerMove = (moveEvent: PointerEvent) => {
      const bounds = workspace.getBoundingClientRect();

      if (zone === "left") {
        const maxLeft = Math.max(
          MIN_SIDE_PANEL_SIZE,
          bounds.width - panelSizes.right - MIN_CENTER_PANEL_SIZE - 10
        );
        panelSizes.left = clamp(moveEvent.clientX - bounds.left, MIN_SIDE_PANEL_SIZE, maxLeft);
      } else if (zone === "right") {
        const maxRight = Math.max(
          MIN_SIDE_PANEL_SIZE,
          bounds.width - panelSizes.left - MIN_CENTER_PANEL_SIZE - 10
        );
        panelSizes.right = clamp(bounds.right - moveEvent.clientX, MIN_SIDE_PANEL_SIZE, maxRight);
      } else {
        const maxBottom = Math.max(MIN_BOTTOM_PANEL_SIZE, bounds.height - MIN_TOP_PANEL_SIZE - 10);
        panelSizes.bottom = clamp(bounds.bottom - moveEvent.clientY, MIN_BOTTOM_PANEL_SIZE, maxBottom);
      }

      applyWorkspaceSizes(workspace);
    };

    const stop = () => {
      handle.classList.remove("is-dragging");
      body.classList.remove("mge-is-resizing-col", "mge-is-resizing-row");
      documentRef.removeEventListener("pointermove", onPointerMove);
      documentRef.removeEventListener("pointerup", stop);
    };

    documentRef.addEventListener("pointermove", onPointerMove);
    documentRef.addEventListener("pointerup", stop);
  }

  return ui;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createPropertyField(row: MGEngineUIPropertyRowDefinition): HTMLElement {
  if (row.kind === "boolean") {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(row.value);
    input.disabled = row.readOnly ?? false;
    input.addEventListener("change", () => row.onChange?.(input.checked));
    return input;
  }

  if (row.kind === "textarea") {
    const textarea = document.createElement("textarea");
    textarea.value = String(row.value);
    textarea.readOnly = row.readOnly ?? false;
    textarea.addEventListener("change", () => row.onChange?.(textarea.value));
    return textarea;
  }

  const input = document.createElement("input");
  input.type = row.kind === "number" ? "number" : "text";
  input.value = String(row.value);
  input.readOnly = row.readOnly ?? false;
  input.addEventListener("change", () => {
    row.onChange?.(row.kind === "number" ? Number(input.value) : input.value);
  });
  return input;
}

function ensureStyles(documentRef: Document): void {
  if (documentRef.getElementById(STYLE_ID)) {
    return;
  }

  const style = documentRef.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    :root {
      --mge-bg: #262626;
      --mge-bg-alt: #303030;
      --mge-bg-strong: #1b1b1b;
      --mge-panel: #353535;
      --mge-panel-alt: #2b2b2b;
      --mge-panel-strong: #202020;
      --mge-line: #171717;
      --mge-line-soft: #484848;
      --mge-text: #d4d4d4;
      --mge-text-muted: #989898;
      --mge-accent: #4c7ca5;
      --mge-accent-strong: #2f5f88;
      --mge-accent-soft: rgba(76, 124, 165, 0.24);
      --mge-danger: #b85a5a;
      color: var(--mge-text);
      font-family: Tahoma, "Segoe UI", sans-serif;
      font-size: 12px;
    }
    * {
      box-sizing: border-box;
    }
    html,
    body {
      background: var(--mge-bg-strong);
      height: 100%;
      margin: 0;
      overflow: hidden;
    }
    body,
    button,
    input,
    select,
    textarea {
      color: var(--mge-text);
      font: inherit;
    }
    #editor-root {
      height: 100%;
      position: relative;
      width: 100%;
    }
    .mge-shell {
      background: linear-gradient(180deg, #313131 0%, #262626 100%);
      color: var(--mge-text);
      display: grid;
      grid-template-rows: auto 1fr;
      height: 100vh;
      min-height: 100vh;
    }
    .mge-topbar {
      align-items: center;
      border-bottom: 1px solid var(--mge-line);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
      display: grid;
      gap: 0.4rem 0.75rem;
      grid-template-columns: minmax(10rem, auto) 1fr auto auto;
      padding: 0.35rem 0.5rem;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .mge-brand {
      display: grid;
      gap: 0.05rem;
    }
    .mge-brand strong {
      font-size: 0.95rem;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .mge-brand span,
    .mge-status,
    .mge-empty {
      color: var(--mge-text-muted);
      font-size: 0.82rem;
    }
    .mge-menu-row,
    .mge-toolbar {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }
    .mge-menu {
      position: relative;
    }
    .mge-menu__trigger,
    .mge-ui-button,
    .mge-tab,
    .mge-palette__item,
    .mge-menu__item {
      background: linear-gradient(180deg, #3c3c3c 0%, #323232 100%);
      border: 1px solid var(--mge-line);
      color: var(--mge-text);
      cursor: pointer;
      min-height: 1.95rem;
      padding: 0.3rem 0.65rem;
      text-align: left;
    }
    .mge-menu__trigger:hover,
    .mge-ui-button:hover,
    .mge-tab:hover,
    .mge-palette__item:hover,
    .mge-menu__item:hover {
      background: linear-gradient(180deg, #444444 0%, #363636 100%);
    }
    .mge-ui-button--accent {
      background: linear-gradient(180deg, #5b8ab3 0%, var(--mge-accent-strong) 100%);
      border-color: #244662;
    }
    .mge-ui-button--ghost,
    .mge-tab.is-active {
      background: linear-gradient(180deg, #434343 0%, #383838 100%);
    }
    .mge-tab.is-active {
      box-shadow: inset 0 2px 0 var(--mge-accent);
    }
    .mge-menu__dropdown {
      background: #2b2b2b;
      border: 1px solid var(--mge-line);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.3);
      display: grid;
      gap: 1px;
      min-width: 10rem;
      padding: 0.2rem;
      position: absolute;
      top: calc(100% + 0.2rem);
    }
    .mge-workspace {
      --mge-bottom-size: 180px;
      --mge-left-size: 248px;
      --mge-right-size: 300px;
      --mge-splitter-size: 5px;
      background: var(--mge-bg-strong);
      display: grid;
      grid-template-areas:
        "left left-resize center right-resize right"
        "bottom-resize bottom-resize bottom-resize bottom-resize bottom-resize"
        "bottom bottom bottom bottom bottom";
      grid-template-columns:
        minmax(${MIN_SIDE_PANEL_SIZE}px, var(--mge-left-size))
        var(--mge-splitter-size)
        minmax(0, 1fr)
        var(--mge-splitter-size)
        minmax(${MIN_SIDE_PANEL_SIZE}px, var(--mge-right-size));
      grid-template-rows: minmax(0, 1fr) var(--mge-splitter-size) minmax(${MIN_BOTTOM_PANEL_SIZE}px, var(--mge-bottom-size));
      min-height: 0;
    }
    .mge-panel-zone {
      background: var(--mge-panel);
      border: 1px solid var(--mge-line);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }
    .mge-panel-zone--left { grid-area: left; }
    .mge-panel-zone--center { grid-area: center; }
    .mge-panel-zone--right { grid-area: right; }
    .mge-panel-zone--bottom { grid-area: bottom; }
    .mge-panel-zone--center {
      background: var(--mge-panel-strong);
    }
    .mge-resize-handle {
      background: #202020;
      position: relative;
      touch-action: none;
      z-index: 2;
    }
    .mge-resize-handle::after {
      background: #505050;
      content: "";
      opacity: 0.65;
      position: absolute;
    }
    .mge-resize-handle:hover::after,
    .mge-resize-handle.is-dragging::after {
      background: var(--mge-accent);
      opacity: 1;
    }
    .mge-resize-handle--left {
      cursor: col-resize;
      grid-area: left-resize;
    }
    .mge-resize-handle--left::after,
    .mge-resize-handle--right::after {
      inset: 0 2px;
    }
    .mge-resize-handle--right {
      cursor: col-resize;
      grid-area: right-resize;
    }
    .mge-resize-handle--bottom {
      cursor: row-resize;
      grid-area: bottom-resize;
    }
    .mge-resize-handle--bottom::after {
      inset: 2px 0;
    }
    .mge-is-resizing-col {
      cursor: col-resize;
      user-select: none;
    }
    .mge-is-resizing-row {
      cursor: row-resize;
      user-select: none;
    }
    .mge-tabs {
      background: #252525;
      border-bottom: 1px solid var(--mge-line);
      display: flex;
      gap: 1px;
      overflow-x: auto;
      padding: 0;
    }
    .mge-panel-frame,
    .mge-panel-frame__content {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-height: 0;
    }
    .mge-panel-frame__header {
      align-items: center;
      background: linear-gradient(180deg, #3a3a3a 0%, #313131 100%);
      border-bottom: 1px solid var(--mge-line);
      display: flex;
      justify-content: space-between;
      padding: 0.35rem 0.5rem;
    }
    .mge-panel-frame__content {
      background: var(--mge-panel-alt);
      overflow: auto;
      padding: 0.5rem;
    }
    .mge-panel-frame__content--viewport {
      background: #1a1a1a;
      overflow: hidden;
      padding: 0;
    }
    .mge-dock-select,
    .mge-property-row input,
    .mge-property-row textarea,
    .mge-palette__input {
      background: #262626;
      border: 1px solid var(--mge-line);
      color: var(--mge-text);
      min-height: 1.9rem;
      padding: 0.3rem 0.45rem;
    }
    .mge-tree,
    .mge-property-grid,
    .mge-stack {
      display: grid;
      gap: 0.4rem;
    }
    .mge-tree-node {
      align-items: center;
      background: #373737;
      border: 1px solid #262626;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      padding: 0.4rem 0.5rem;
    }
    .mge-tree-node.is-selected {
      background: var(--mge-accent-soft);
      border-color: var(--mge-accent);
    }
    .mge-tree-children {
      border-left: 1px solid #404040;
      margin-left: 0.6rem;
      padding-left: 0.6rem;
    }
    .mge-property-row {
      align-items: center;
      display: grid;
      gap: 0.35rem;
      grid-template-columns: minmax(5.5rem, 7.5rem) 1fr;
    }
    .mge-property-row__label {
      color: var(--mge-text-muted);
      font-size: 0.8rem;
    }
    .mge-overlay {
      align-items: center;
      background: rgba(8, 8, 8, 0.58);
      display: flex;
      inset: 0;
      justify-content: center;
      position: fixed;
      z-index: 30;
    }
    .mge-modal,
    .mge-palette {
      background: #2b2b2b;
      border: 1px solid var(--mge-line);
      box-shadow: 0 24px 52px rgba(0, 0, 0, 0.45);
      display: grid;
      gap: 0.5rem;
      padding: 0.75rem;
      width: min(38rem, calc(100vw - 2rem));
    }
    .mge-modal__header {
      align-items: center;
      display: flex;
      justify-content: space-between;
    }
    .mge-section {
      background: #313131;
      border: 1px solid #252525;
      padding: 0.45rem;
    }
    .mge-viewport-panel {
      background: #1a1a1a;
      display: grid;
      grid-template-rows: auto 1fr;
      min-height: 100%;
    }
    .mge-viewport-toolbar {
      align-items: center;
      background: #2a2a2a;
      border-bottom: 1px solid var(--mge-line);
      display: flex;
      gap: 0.25rem;
      padding: 0.35rem 0.45rem;
    }
    .mge-viewport-frame {
      background: #171717;
      min-height: 24rem;
      overflow: hidden;
    }
    .mge-log-entry {
      background: #313131;
      border: 1px solid #252525;
      display: grid;
      gap: 0.2rem;
      padding: 0.45rem 0.55rem;
    }
    .mge-log-entry__meta {
      color: var(--mge-text-muted);
      font-size: 0.78rem;
    }
    @media (max-width: 1080px) {
      .mge-topbar {
        grid-template-columns: 1fr;
      }
      .mge-workspace {
        grid-template-areas:
          "center"
          "left"
          "right"
          "bottom";
        grid-template-columns: 1fr;
        grid-template-rows: minmax(24rem, 1fr) repeat(3, minmax(14rem, auto));
      }
      .mge-resize-handle {
        display: none;
      }
    }
  `;
  documentRef.head.append(style);
}

function renderTreeNode(node: MGEngineUITreeNode): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "mge-stack";
  const button = document.createElement("button");
  button.className = node.selected ? "mge-tree-node is-selected" : "mge-tree-node";
  button.textContent = node.label;

  if (node.trailing) {
    const trailing = document.createElement("span");
    trailing.textContent = node.trailing;
    button.append(trailing);
  }

  button.addEventListener("click", () => node.onSelect?.());
  wrapper.append(button);

  if (node.children && node.children.length > 0) {
    const children = document.createElement("div");
    children.className = "mge-tree-children";

    for (const child of node.children) {
      children.append(renderTreeNode(child));
    }

    wrapper.append(children);
  }

  return wrapper;
}

function resolveRoot(): HTMLElement {
  const root = document.querySelector<HTMLElement>("[data-mge-root]");

  if (!root) {
    throw new Error('MGEngineUI could not find a root element. Provide "host:root" or add [data-mge-root].');
  }

  return root;
}

export default mgengineuiModule;
