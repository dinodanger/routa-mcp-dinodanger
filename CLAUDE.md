# Routa identity MCP server

We build an MCP server for Routa Advisory's identity platform admin API, so IT can configure access and policies by asking. The project brain is in `brain/`: read `brain/README.md` before working.

- `client/` is what Routa sent. Don't edit it. `brain/` is our reading of it, checked against the running test environment.
- `test-environment/` is Routa's platform on your laptop (`npm run test-environment`, port 4660). Don't edit it. Never run `npm run test-environment:reset` unless the user asks.
- `toolbox/` is the team's default harness. Don't edit it; the adapted skills are in `.claude/skills/` (plan, build, verify).
- `plan.md` holds the steps. The server lives in `mcp/`.
- Never print, log, write or commit a token. They are in `ROUTA_TOKEN` and `ROUTA_READONLY_TOKEN`; don't read the files behind them.
- The limits that bind everything are in `brain/limits.md`. The one that can't fail: a read-only token must never change a setting.
