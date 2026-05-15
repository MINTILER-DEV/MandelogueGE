import type { MGECModule } from "@mge/kernel";

export interface InputService {
  keyDown(code: string): boolean;
}

function resolveKeyboardTarget(): EventTarget | null {
  if (typeof window !== "undefined") {
    return window;
  }

  return null;
}

const inputModule: MGECModule = {
  id: "@mge/input",

  setup(ctx) {
    const keyboardTarget = ctx.services.has("host:keyboard-target")
      ? ctx.services.require<EventTarget>("host:keyboard-target")
      : resolveKeyboardTarget();
    const down = new Set<string>();

    keyboardTarget?.addEventListener("keydown", (event) => {
      const keyboardEvent = event as KeyboardEvent;
      down.add(keyboardEvent.code);
    });

    keyboardTarget?.addEventListener("keyup", (event) => {
      const keyboardEvent = event as KeyboardEvent;
      down.delete(keyboardEvent.code);
    });

    const input: InputService = {
      keyDown(code) {
        return down.has(code);
      }
    };

    ctx.services.provide("input", input, ctx.component.id);
    ctx.log.info("Registered keyboard input.");
  }
};

export default inputModule;
