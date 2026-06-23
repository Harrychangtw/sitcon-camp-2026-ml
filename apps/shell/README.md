# @app/shell

The Next.js (App Router) shell: landing page, station index, top nav, and the
reserved Course 1 API route. It does **not** host station canvases — those live
in the per-course Vite apps and the index links out to them.

## Run

```bash
pnpm --filter @app/shell dev     # http://localhost:3000
```

## Notes

- Station links point at the course apps' dev origin. Course 2 defaults to
  `http://localhost:5173`; override with `NEXT_PUBLIC_COURSE2_URL`.
- `app/api/synthetic/route.ts` returns **501** — it's a stub for Course 1.
- Internal `@camp/*` packages are TS source; `next.config.mjs` lists them in
  `transpilePackages`.
- SSR is ON here (it's Next). Keep this app free of `three`/`onnx`/`window`
  usage; the heavy client canvases belong in the Vite course apps.
