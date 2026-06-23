# @camp/tsconfig

Shared TypeScript base configs consumed by every package and app in the monorepo.
Keeping them here means strictness and module-resolution rules are set **once**.

## What's here

| File                  | Extend it from…                          |
| --------------------- | ---------------------------------------- |
| `base.json`           | (internal) the strict foundation         |
| `react-library.json`  | shared React packages (`@camp/ui`, `@camp/viz`) |
| `vite.json`           | Vite client apps (`apps/course2`)        |
| `nextjs.json`         | Next.js apps (`apps/shell`)              |

## How a consumer uses it

```jsonc
// apps/course2/tsconfig.json
{
  "extends": "@camp/tsconfig/vite.json",
  "compilerOptions": {
    "baseUrl": ".",
    // App-local path aliases. Workspace packages ALSO resolve via node_modules
    // (pnpm symlinks + each package's "exports" → src), so these are explicit
    // convenience, not load-bearing.
    "paths": {
      "@camp/ui": ["../../packages/ui/src"],
      "@camp/viz": ["../../packages/viz/src"],
      "@camp/data": ["../../packages/data/src"]
    }
  },
  "include": ["src"]
}
```

`base.json` turns on `strict`, `noUncheckedIndexedAccess`, `isolatedModules`
(required by esbuild/Vite), and `moduleResolution: "Bundler"` (so bare
`@camp/*` imports resolve through each package's `exports` field).

## What does NOT belong here

- Compiler `paths`/`baseUrl` — those are per-consumer (baseUrl is relative to
  the consuming config; anchoring them here is fragile across TS versions).
- App- or framework-specific `include`/`exclude`.
- Any runtime code. This package ships only JSON.
