# packages/

Optional shared workspace libraries used by multiple cells or apps.

- Cells live under `../cells/` (code + `cell.yaml` only).
- Stack entry and `otavia.yaml` live under `../apps/main/`.

This monorepo uses **Bun** for installs and scripts. Cells are written in **TypeScript**; use `.tsx` for React frontends.
