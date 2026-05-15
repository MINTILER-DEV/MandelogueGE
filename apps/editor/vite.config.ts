import path from "node:path";

import { defineConfig, searchForWorkspaceRoot } from "vite";

export default defineConfig({
  server: {
    allowedHosts: true,
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), path.resolve(__dirname, "../..")]
    }
  }
});
