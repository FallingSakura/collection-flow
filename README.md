# collection-flow

A small tool for managing a bilibili "watch later" (稍后再看) list: a React SPA
for browsing, shuffling and deleting entries, and an Express API that proxies the
bilibili endpoints with the user's own cookie.

## Layout

- `server/` — the Express API (`server.ts`). Its own package and lockfile.
- `client/` — the React + Vite + Tailwind SPA. Its own package and lockfile.
- root — repository tooling only (husky, lint-staged, prettier). No app code.

The two packages are deployed separately on Vercel, both from this repository.

## Development

```bash
pnpm install                # repo tooling (git hooks, formatting)
pnpm -C server install
pnpm -C client install

pnpm -C server dev          # API on http://localhost:3000
pnpm -C client dev          # SPA on http://localhost:5173; /api is proxied
```

Copy `server/.env.example` to `server/.env` to configure the API.

## Deployment (Vercel, two projects)

- API — Root Directory `server`; set `FRONTEND_URL` to the frontend origin(s)
  allowed to call it, comma-separated.
- Client — Root Directory `client`; set `VITE_API_URL` to the deployed API,
  for example `https://collection-flow-api.vercel.app`.
