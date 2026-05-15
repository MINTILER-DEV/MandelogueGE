# MandelogueGE

Phase 0, Phase 1, and a Phase 2 runtime proof are scaffolded here as a TypeScript `pnpm` monorepo.

## Implemented

- Monorepo workspace with shared TypeScript, ESLint, Vitest, and build scripts
- `@mge/kernel` with project/manifest parsing, dependency resolution, feature checks, lifecycle execution, and diagnostics
- Runtime MGECs for `@mge/core`, `@mge/time`, `@mge/scene`, `@mge/ecs`, `@mge/input`, and `@mge/renderer-canvas2d`
- `@mge/demo-square` runtime proof component
- `examples/kernel-proof/.mgeproject.json` plus `pnpm demo:kernel`
- Browser runtime proof app with `pnpm dev:runtime`

## Commands

```bash
pnpm install
pnpm build
pnpm test
pnpm demo:kernel
pnpm dev:runtime
```
