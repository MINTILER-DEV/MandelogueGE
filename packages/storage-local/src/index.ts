import type { MGECModule } from "@mge/kernel";

export interface StorageService {
  getItem(key: string): string | null;
  removeItem?(key: string): void;
  setItem(key: string, value: string): void;
}

const storageLocalModule: MGECModule = {
  id: "@mge/storage-local",

  setup(ctx) {
    const storage = resolveStorage();

    if (!storage) {
      ctx.log.warn("Local storage is unavailable in this environment.");
      return;
    }

    ctx.services.provide("storage", storage, ctx.component.id);
    ctx.log.info("Registered the local project storage service.");
  }
};

function resolveStorage(): StorageService | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  return window.localStorage;
}

export default storageLocalModule;
