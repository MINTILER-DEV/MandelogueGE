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
  keybinding?: string | string[];
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
  icon?: string;
  label: string;
  onOpen?(): void;
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
    run(commandId: string): boolean;
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
    getZone(panelId: string): PanelZone | null;
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

interface FocusedPropertyFieldSnapshot {
  fieldKey: string;
  panelId: string;
  selectionEnd: number | null;
  selectionStart: number | null;
  tagName: "INPUT" | "TEXTAREA";
  value: string;
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
  let shortcutsBound = false;
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
        button.type = "button";
        button.addEventListener("pointerdown", (event) => {
          if (event.button !== 0) {
            return;
          }

          event.preventDefault();
          definition.onClick();
        });
        button.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            definition.onClick();
          }
        });
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
      run(commandId) {
        const command = commands.get(commandId);

        if (!command) {
          return false;
        }

        command.run();
        return true;
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
      bindGlobalShortcuts();
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
      getZone(panelId) {
        const panel = panels.get(panelId);

        if (!panel) {
          return null;
        }

        for (const zone of Object.keys(layout) as PanelZone[]) {
          if (layout[zone].includes(panelId)) {
            return zone;
          }
        }

        return panel.zone ?? "center";
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

        for (const [index, row] of rows.entries()) {
          const label = document.createElement("label");
          label.className = "mge-property-row";

          const name = document.createElement("span");
          name.className = "mge-property-row__label";
          name.textContent = row.label;
          label.append(name);

          const field = createPropertyField(row, `${index}:${row.label}`);
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
    const focusedPropertyField = captureFocusedPropertyField(root.ownerDocument);
    root.replaceChildren();

    const shell = document.createElement("div");
    shell.className = "mge-shell";
    shell.append(renderTopbar());
    shell.append(renderWorkspace());
    shell.append(renderStatusbar());

    if (paletteOpen) {
      shell.append(renderCommandPalette());
    }

    if (modalDefinition) {
      shell.append(renderModal());
    }

    root.append(shell);
    restoreFocusedPropertyField(root.ownerDocument, focusedPropertyField);
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
      const label = document.createElement("span");
      label.className = "mge-command-label";
      label.textContent = command.title;
      button.append(label);

      const shortcut = formatCommandKeybinding(command);

      if (shortcut) {
        const shortcutLabel = document.createElement("span");
        shortcutLabel.className = "mge-command-shortcut";
        shortcutLabel.textContent = shortcut;
        button.append(shortcutLabel);
      }

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

    if (zone !== "left") {
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
    }

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
    bar.className = "mge-titlebar";

    const menuRow = document.createElement("div");
    menuRow.className = "mge-titlebar__menus";

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

    const title = document.createElement("div");
    title.className = "mge-titlebar__title";
    title.textContent = branding.subtitle ? `${branding.title} - ${branding.subtitle}` : branding.title;
    bar.append(title);

    const toolbar = document.createElement("div");
    toolbar.className = "mge-titlebar__actions";

    for (const command of ui.commands.list().filter((candidate) => candidate.toolbar)) {
      toolbar.append(
        ui.button.create({
          label: command.title,
          onClick: command.run,
          title: formatCommandTooltip(command),
          variant: "ghost"
        })
      );
    }

    toolbar.append(
      ui.button.create({
        label: "Palette",
        onClick: () => ui.commands.openPalette(),
        title: formatCommandTooltip(commands.get("editor.palette") ?? null),
        variant: "accent"
      })
    );
    bar.append(toolbar);

    return bar;
  }

  function renderStatusbar(): HTMLElement {
    const statusbar = document.createElement("footer");
    statusbar.className = "mge-statusbar";

    const projectLabel = document.createElement("span");
    projectLabel.textContent = branding.subtitle ?? branding.title;
    statusbar.append(projectLabel);

    const modeLabel = document.createElement("span");
    modeLabel.textContent = statusText;
    statusbar.append(modeLabel);

    return statusbar;
  }

  function renderWorkspace(): HTMLElement {
    const workspace = document.createElement("main");
    workspace.className = "mge-workspace";
    applyWorkspaceSizes(workspace);
    workspace.append(
      renderActivityRail(),
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

  function renderActivityRail(): HTMLElement {
    const rail = document.createElement("aside");
    rail.className = "mge-activity-rail";
    rail.dataset.zone = "left";
    const panelIds = layout.left.filter((panelId) => panels.has(panelId));

    if (panelIds.length === 0) {
      return rail;
    }

    for (const panelId of panelIds) {
      const panel = panels.get(panelId) as MGEngineUIPanelDefinition;
      const button = document.createElement("button");
      button.className = panelId === activeByZone.left ? "mge-activity-button is-active" : "mge-activity-button";
      button.textContent = abbreviationForPanel(panel.title);
      button.title = panel.title;
      button.type = "button";
      button.addEventListener("click", () => ui.panels.setActive(panelId));
      rail.append(button);
    }

    return rail;
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

  function bindGlobalShortcuts(): void {
    if (shortcutsBound) {
      return;
    }

    shortcutsBound = true;
    root.ownerDocument.defaultView?.addEventListener("keydown", handleGlobalKeydown);
  }

  function handleGlobalKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) {
      return;
    }

    if (event.key === "Escape" && paletteOpen) {
      event.preventDefault();
      ui.commands.closePalette();
      return;
    }

    const focusedElement = root.ownerDocument.activeElement;
    const textFieldFocused =
      focusedElement instanceof HTMLInputElement ||
      focusedElement instanceof HTMLTextAreaElement ||
      Boolean((focusedElement as HTMLElement | null)?.isContentEditable);

    if (textFieldFocused && !(event.ctrlKey || event.metaKey || event.altKey)) {
      return;
    }

    for (const command of commands.values()) {
      for (const candidate of resolveCommandKeybindings(command)) {
        if (!matchesKeybinding(candidate, event)) {
          continue;
        }

        event.preventDefault();
        event.stopPropagation();

        if (paletteOpen) {
          ui.commands.closePalette();
        }

        command.run();
        return;
      }
    }
  }

  return ui;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createPropertyField(row: MGEngineUIPropertyRowDefinition, fieldKey: string): HTMLElement {
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
    textarea.dataset.mgeFieldKey = fieldKey;
    textarea.value = String(row.value);
    textarea.readOnly = row.readOnly ?? false;
    textarea.addEventListener("change", () => row.onChange?.(textarea.value));
    return textarea;
  }

  const input = document.createElement("input");
  input.dataset.mgeFieldKey = fieldKey;
  input.type = row.kind === "number" ? "number" : "text";
  input.value = String(row.value);
  input.readOnly = row.readOnly ?? false;
  input.addEventListener("change", () => {
    row.onChange?.(row.kind === "number" ? Number(input.value) : input.value);
  });
  return input;
}

function captureFocusedPropertyField(documentRef: Document): FocusedPropertyFieldSnapshot | null {
  const activeElement = documentRef.activeElement;

  if (!(activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)) {
    return null;
  }

  const fieldKey = activeElement.dataset.mgeFieldKey;
  const panelId = activeElement.closest<HTMLElement>("[data-panel-id]")?.dataset.panelId;

  if (!fieldKey || !panelId || !activeElement.closest(".mge-property-grid")) {
    return null;
  }

  return {
    fieldKey,
    panelId,
    selectionEnd: typeof activeElement.selectionEnd === "number" ? activeElement.selectionEnd : null,
    selectionStart: typeof activeElement.selectionStart === "number" ? activeElement.selectionStart : null,
    tagName: activeElement.tagName as "INPUT" | "TEXTAREA",
    value: activeElement.value
  };
}

function restoreFocusedPropertyField(
  documentRef: Document,
  snapshot: FocusedPropertyFieldSnapshot | null
): void {
  if (!snapshot) {
    return;
  }

  const selector = `[data-panel-id="${snapshot.panelId}"] [data-mge-field-key="${snapshot.fieldKey}"]`;
  const field = documentRef.querySelector(selector);

  if (snapshot.tagName === "INPUT") {
    if (!(field instanceof HTMLInputElement)) {
      return;
    }

    field.value = snapshot.value;
    field.focus();

    if (snapshot.selectionStart !== null && snapshot.selectionEnd !== null) {
      field.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    }

    return;
  }

  if (!(field instanceof HTMLTextAreaElement)) {
    return;
  }

  field.value = snapshot.value;
  field.focus();

  if (snapshot.selectionStart !== null && snapshot.selectionEnd !== null) {
    field.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
  }
}

function ensureStyles(documentRef: Document): void {
  if (documentRef.getElementById(STYLE_ID)) {
    return;
  }

  const style = documentRef.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    :root {
      --mge-bg: #1e1e1e;
      --mge-bg-alt: #252526;
      --mge-bg-strong: #181818;
      --mge-panel: #252526;
      --mge-panel-alt: #1f1f1f;
      --mge-panel-strong: #1a1a1a;
      --mge-line: #111111;
      --mge-line-soft: #3d3d3d;
      --mge-text: #cccccc;
      --mge-text-muted: #8b8b8b;
      --mge-accent: #0e639c;
      --mge-accent-strong: #1177bb;
      --mge-accent-soft: rgba(14, 99, 156, 0.28);
      --mge-danger: #b85a5a;
      color: var(--mge-text);
      font-family: "Segoe UI", Tahoma, sans-serif;
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
      background: var(--mge-bg);
      color: var(--mge-text);
      display: grid;
      grid-template-rows: auto 1fr auto;
      height: 100vh;
      min-height: 100vh;
    }
    .mge-titlebar {
      align-items: center;
      background: var(--mge-bg-strong);
      border-bottom: 1px solid #000;
      display: grid;
      grid-template-columns: auto minmax(12rem, 1fr) auto;
      min-height: 2.3rem;
      padding: 0 0.6rem;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .mge-titlebar__menus,
    .mge-titlebar__actions {
      align-items: center;
      display: flex;
      gap: 0.2rem;
      min-width: 0;
    }
    .mge-titlebar__title,
    .mge-empty {
      color: var(--mge-text-muted);
      font-size: 0.9rem;
    }
    .mge-titlebar__title {
      overflow: hidden;
      padding: 0 1rem;
      text-align: center;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mge-statusbar {
      align-items: center;
      background: var(--mge-accent);
      color: #ffffff;
      display: flex;
      gap: 1rem;
      justify-content: space-between;
      min-height: 1.5rem;
      padding: 0 0.55rem;
    }
    .mge-statusbar span,
    .mge-empty {
      color: var(--mge-text-muted);
      font-size: 0.82rem;
    }
    .mge-statusbar span {
      color: #ffffff;
    }
    .mge-menu {
      position: relative;
    }
    .mge-menu__trigger,
    .mge-ui-button,
    .mge-tab,
    .mge-palette__item,
    .mge-menu__item {
      background: #2a2d2e;
      border: 1px solid transparent;
      color: var(--mge-text);
      cursor: pointer;
      min-height: 1.8rem;
      padding: 0.2rem 0.55rem;
      text-align: left;
    }
    .mge-menu__trigger:hover,
    .mge-ui-button:hover,
    .mge-tab:hover,
    .mge-palette__item:hover,
    .mge-menu__item:hover {
      background: #414141;
    }
    .mge-ui-button--accent {
      background: var(--mge-accent-strong);
      border-color: #0d4f7a;
    }
    .mge-ui-button--ghost,
    .mge-tab.is-active {
      background: #2f3136;
    }
    .mge-tab.is-active {
      box-shadow: inset 0 1px 0 var(--mge-accent), inset 0 -1px 0 var(--mge-accent);
    }
    .mge-menu__dropdown {
      background: var(--mge-bg-alt);
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
      --mge-activity-size: 3rem;
      --mge-bottom-size: 180px;
      --mge-left-size: 248px;
      --mge-right-size: 300px;
      --mge-splitter-size: 5px;
      background: var(--mge-bg-strong);
      display: grid;
      grid-template-areas:
        "activity left left-resize center right-resize right"
        "activity bottom-resize bottom-resize bottom-resize bottom-resize bottom-resize"
        "activity bottom bottom bottom bottom bottom";
      grid-template-columns:
        var(--mge-activity-size)
        minmax(${MIN_SIDE_PANEL_SIZE}px, var(--mge-left-size))
        var(--mge-splitter-size)
        minmax(0, 1fr)
        var(--mge-splitter-size)
        minmax(${MIN_SIDE_PANEL_SIZE}px, var(--mge-right-size));
      grid-template-rows: minmax(0, 1fr) var(--mge-splitter-size) minmax(${MIN_BOTTOM_PANEL_SIZE}px, var(--mge-bottom-size));
      min-height: 0;
    }
    .mge-activity-rail {
      background: var(--mge-bg-strong);
      border-right: 1px solid #000;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      grid-area: activity;
      padding: 0.35rem 0.25rem;
    }
    .mge-activity-button {
      align-items: center;
      background: transparent;
      border: 1px solid transparent;
      color: var(--mge-text-muted);
      cursor: pointer;
      display: flex;
      font-size: 0.72rem;
      font-weight: 700;
      height: 2.1rem;
      justify-content: center;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .mge-activity-button.is-active {
      background: #252526;
      border-color: #000;
      color: var(--mge-text);
      box-shadow: inset 2px 0 0 var(--mge-accent);
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
      background: #1f1f1f;
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
      background: #252526;
      border-bottom: 1px solid var(--mge-line);
      display: flex;
      justify-content: space-between;
      padding: 0.35rem 0.5rem;
    }
    .mge-panel-frame__content {
      background: var(--mge-panel-alt);
      overflow: auto;
      padding: 0.55rem;
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
      background: #1f1f1f;
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
      background: #252526;
      border: 1px solid transparent;
      cursor: pointer;
      display: flex;
      gap: 0.45rem;
      justify-content: space-between;
      min-height: 1.85rem;
      padding: 0.24rem 0.45rem;
    }
    .mge-tree-node.is-selected {
      background: rgba(55, 148, 255, 0.16);
      border-color: rgba(55, 148, 255, 0.35);
    }
    .mge-tree-node__main,
    .mge-tree-node__meta {
      align-items: center;
      display: flex;
      gap: 0.4rem;
      min-width: 0;
    }
    .mge-tree-node__label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mge-tree-node__icon,
    .mge-tree-node__trailing,
    .mge-command-shortcut {
      color: var(--mge-text-muted);
      font-size: 0.78rem;
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
      background: var(--mge-bg-alt);
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
      background: #252526;
      border: 1px solid #1a1a1a;
      padding: 0.45rem;
    }
    .mge-inline-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }
    .mge-command-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mge-palette__item {
      align-items: center;
      display: flex;
      justify-content: space-between;
      gap: 1rem;
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
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 24rem;
      overflow: hidden;
      padding: 0.5rem;
      position: relative;
    }
    .mge-viewport-frame--live {
      padding: 0;
    }
    .mge-viewport-stage {
      background: #111111;
      border: 1px solid #0d0d0d;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02);
      overflow: hidden;
      position: relative;
    }
    .mge-viewport-stage--preview {
      aspect-ratio: 16 / 9;
      height: auto;
      max-height: 100%;
      max-width: 100%;
      width: min(100%, calc((100vh - 14rem) * 16 / 9));
    }
    .mge-viewport-stage--live {
      height: 100%;
      width: 100%;
    }
    .mge-viewport-stage canvas {
      display: block;
      height: 100%;
      width: 100%;
    }
    .mge-viewport-status,
    .mge-viewport-hint {
      color: var(--mge-text-muted);
      font-size: 0.78rem;
    }
    .mge-viewport-status {
      margin-left: auto;
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
      .mge-titlebar {
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
      .mge-activity-rail {
        display: none;
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

  const main = document.createElement("span");
  main.className = "mge-tree-node__main";

  if (node.icon) {
    const icon = document.createElement("span");
    icon.className = "mge-tree-node__icon";
    icon.textContent = node.icon;
    main.append(icon);
  }

  const label = document.createElement("span");
  label.className = "mge-tree-node__label";
  label.textContent = node.label;
  main.append(label);
  button.append(main);

  if (node.trailing) {
    const meta = document.createElement("span");
    meta.className = "mge-tree-node__meta";
    const trailing = document.createElement("span");
    trailing.className = "mge-tree-node__trailing";
    trailing.textContent = node.trailing;
    meta.append(trailing);
    button.append(meta);
  }

  button.addEventListener("click", () => node.onSelect?.());
  button.addEventListener("dblclick", () => node.onOpen?.());
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

function abbreviationForPanel(title: string): string {
  const words = title
    .split(/\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (words.length >= 2) {
    return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`;
  }

  return title.slice(0, 2);
}

function formatCommandKeybinding(command: MGEngineUICommandDefinition | null): string | null {
  const first = resolveCommandKeybindings(command)[0];
  return first ?? null;
}

function formatCommandTooltip(command: MGEngineUICommandDefinition | null): string | undefined {
  if (!command) {
    return undefined;
  }

  const keybinding = formatCommandKeybinding(command);
  return keybinding ? `${command.title} (${keybinding})` : command.title;
}

function resolveCommandKeybindings(command: MGEngineUICommandDefinition | null): string[] {
  if (!command?.keybinding) {
    return [];
  }

  return Array.isArray(command.keybinding) ? command.keybinding : [command.keybinding];
}

function matchesKeybinding(binding: string, event: KeyboardEvent): boolean {
  const expected = parseKeybinding(binding);

  if (!expected) {
    return false;
  }

  return (
    expected.alt === event.altKey &&
    expected.ctrl === event.ctrlKey &&
    expected.meta === event.metaKey &&
    expected.shift === event.shiftKey &&
    expected.key === normalizeEventKey(event.key)
  );
}

function parseKeybinding(binding: string): {
  alt: boolean;
  ctrl: boolean;
  key: string;
  meta: boolean;
  shift: boolean;
} | null {
  const tokens = binding
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return null;
  }

  let alt = false;
  let ctrl = false;
  let meta = false;
  let shift = false;
  let key: string | null = null;

  for (const token of tokens) {
    const normalized = token.toLowerCase();

    if (normalized === "ctrl" || normalized === "control") {
      ctrl = true;
      continue;
    }

    if (normalized === "shift") {
      shift = true;
      continue;
    }

    if (normalized === "alt") {
      alt = true;
      continue;
    }

    if (normalized === "cmd" || normalized === "meta" || normalized === "win") {
      meta = true;
      continue;
    }

    if (normalized === "mod") {
      ctrl = true;
      continue;
    }

    key = normalizeEventKey(token);
  }

  return key ? { alt, ctrl, key, meta, shift } : null;
}

function normalizeEventKey(value: string): string {
  if (value === " ") {
    return "space";
  }

  return value.toLowerCase();
}

function resolveRoot(): HTMLElement {
  const root = document.querySelector<HTMLElement>("[data-mge-root]");

  if (!root) {
    throw new Error('MGEngineUI could not find a root element. Provide "host:root" or add [data-mge-root].');
  }

  return root;
}

export default mgengineuiModule;
