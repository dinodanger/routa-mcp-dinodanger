# Conventions

Source: `client/conventions.md`.

- TypeScript on Node 22.18+, run directly (`node file.ts`). Only syntax Node can strip: no `enum`, `namespace` or parameter properties. ES modules; import local files with `.ts`.
- **No npm packages**, in the server or the tests. MCP over stdio is newline-delimited JSON-RPC. Tests use `node:test` and `node:assert/strict`.
- Layout: `mcp/src/` (one file per tool in `mcp/src/tools/`), `mcp/test/<module>.test.ts`. Run tests with `node --test "mcp/test/*.test.ts"`.
- Config: `ROUTA_URL` (default `http://localhost:4660`), `MCP_TOKEN` (the user's token, read-only or admin).
- Style: two-space indent, double quotes, semicolons, small functions with plain names, functions over classes.
- Commits: one line saying what and why.
