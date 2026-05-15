# MandelogueGE

Phase 0 and Phase 1 are scaffolded here as a TypeScript `pnpm` monorepo with a working `@mge/kernel` proof.

## Implemented

- Monorepo workspace with shared TypeScript, ESLint, Vitest, and build scripts
- `@mge/kernel` with project/manifest parsing, dependency resolution, feature checks, lifecycle execution, and diagnostics
- `@mge/core` and `@mge/test-package` sample MGECs
- `examples/kernel-proof/.mgeproject.json` plus `pnpm demo:kernel`

## Commands

```bash
pnpm install
pnpm build
pnpm test
pnpm demo:kernel
```

