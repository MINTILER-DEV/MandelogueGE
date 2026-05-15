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
    content.className = "mge-panel-frame__content";
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
    workspace.append(
      renderPanel("left"),
      renderPanel("center"),
      renderPanel("right"),
      renderPanel("bottom")
    );
    return workspace;
  }

  return ui;
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
      --mge-bg: #11141b;
      --mge-bg-alt: #161c25;
      --mge-panel: rgba(16, 18, 24, 0.82);
      --mge-line: rgba(255, 255, 255, 0.08);
      --mge-text: #f0eee7;
      --mge-text-muted: #aab2c1;
      --mge-accent: #ff7a1a;
      --mge-accent-soft: rgba(255, 122, 26, 0.18);
      --mge-danger: #ff5f56;
      color: var(--mge-text);
      font-family: "Segoe UI Variable Display", "Trebuchet MS", "Gill Sans", sans-serif;
    }
    .mge-shell {
      background:
        radial-gradient(circle at top left, rgba(255, 122, 26, 0.16), transparent 28%),
        radial-gradient(circle at right, rgba(73, 145, 255, 0.12), transparent 30%),
        linear-gradient(180deg, #131720 0%, #0a0c11 100%);
      color: var(--mge-text);
      min-height: 100vh;
    }
    .mge-topbar {
      align-items: center;
      backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--mge-line);
      display: grid;
      gap: 1rem;
      grid-template-columns: minmax(12rem, 18rem) 1fr auto auto;
      padding: 0.85rem 1rem;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .mge-brand {
      display: grid;
      gap: 0.15rem;
    }
    .mge-brand strong {
      font-size: 1rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .mge-brand span,
    .mge-status,
    .mge-empty {
      color: var(--mge-text-muted);
      font-size: 0.9rem;
    }
    .mge-menu-row,
    .mge-toolbar {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .mge-menu {
      position: relative;
    }
    .mge-menu__trigger,
    .mge-ui-button,
    .mge-tab,
    .mge-palette__item,
    .mge-menu__item {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--mge-line);
      border-radius: 999px;
      color: var(--mge-text);
      cursor: pointer;
      padding: 0.45rem 0.8rem;
    }
    .mge-ui-button--accent {
      background: linear-gradient(135deg, #ff7a1a, #ff4d39);
      border-color: transparent;
    }
    .mge-ui-button--ghost,
    .mge-tab.is-active {
      background: rgba(255, 255, 255, 0.1);
    }
    .mge-menu__dropdown {
      background: rgba(13, 16, 22, 0.96);
      border: 1px solid var(--mge-line);
      border-radius: 1rem;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
      display: grid;
      gap: 0.35rem;
      min-width: 10rem;
      padding: 0.5rem;
      position: absolute;
      top: calc(100% + 0.35rem);
    }
    .mge-workspace {
      display: grid;
      gap: 0.9rem;
      grid-template-areas:
        "left center right"
        "bottom bottom bottom";
      grid-template-columns: minmax(15rem, 18rem) 1fr minmax(17rem, 21rem);
      grid-template-rows: minmax(28rem, 1fr) minmax(13rem, 16rem);
      min-height: calc(100vh - 4.75rem);
      padding: 0.9rem;
    }
    .mge-panel-zone {
      backdrop-filter: blur(14px);
      background: var(--mge-panel);
      border: 1px solid var(--mge-line);
      border-radius: 1.2rem;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.2);
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }
    .mge-panel-zone--left { grid-area: left; }
    .mge-panel-zone--center { grid-area: center; }
    .mge-panel-zone--right { grid-area: right; }
    .mge-panel-zone--bottom { grid-area: bottom; }
    .mge-tabs {
      border-bottom: 1px solid var(--mge-line);
      display: flex;
      gap: 0.5rem;
      overflow-x: auto;
      padding: 0.6rem;
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
      border-bottom: 1px solid var(--mge-line);
      display: flex;
      justify-content: space-between;
      padding: 0.75rem 0.9rem;
    }
    .mge-panel-frame__content {
      overflow: auto;
      padding: 0.9rem;
    }
    .mge-dock-select,
    .mge-property-row input,
    .mge-property-row textarea,
    .mge-palette__input {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--mge-line);
      border-radius: 0.75rem;
      color: var(--mge-text);
      padding: 0.55rem 0.7rem;
    }
    .mge-tree,
    .mge-property-grid,
    .mge-stack {
      display: grid;
      gap: 0.6rem;
    }
    .mge-tree-node {
      align-items: center;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid transparent;
      border-radius: 0.9rem;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      padding: 0.65rem 0.8rem;
    }
    .mge-tree-node.is-selected {
      background: var(--mge-accent-soft);
      border-color: rgba(255, 122, 26, 0.45);
    }
    .mge-tree-children {
      border-left: 1px solid var(--mge-line);
      margin-left: 0.75rem;
      padding-left: 0.75rem;
    }
    .mge-property-row {
      align-items: center;
      display: grid;
      gap: 0.5rem;
      grid-template-columns: minmax(6rem, 9rem) 1fr;
    }
    .mge-property-row__label {
      color: var(--mge-text-muted);
      font-size: 0.88rem;
    }
    .mge-overlay {
      align-items: center;
      background: rgba(4, 5, 8, 0.6);
      display: flex;
      inset: 0;
      justify-content: center;
      position: fixed;
      z-index: 30;
    }
    .mge-modal,
    .mge-palette {
      background: rgba(15, 17, 22, 0.98);
      border: 1px solid var(--mge-line);
      border-radius: 1.25rem;
      box-shadow: 0 32px 90px rgba(0, 0, 0, 0.45);
      display: grid;
      gap: 0.8rem;
      padding: 1rem;
      width: min(38rem, calc(100vw - 2rem));
    }
    .mge-modal__header {
      align-items: center;
      display: flex;
      justify-content: space-between;
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
