# ForeverTracker

Self-hosted companion app for WoW: Forever. pnpm TypeScript monorepo.

- `packages/savedvars`: SavedVariables parser
- `packages/content`: ForeverDB client and mirror
- `packages/db`: Drizzle schema and DB access
- `packages/core`: snapshot types and advice rules

## Development

```sh
pnpm install
pnpm test
pnpm typecheck
```

Copy `.env.example` to `.env` and fill in values. See `docs/` for the design spec.
