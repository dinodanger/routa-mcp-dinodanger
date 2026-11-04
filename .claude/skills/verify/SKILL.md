---
name: verify
description: Check whether the Routa MCP server is done. Use after each build step, and before saying the work is done.
---

Run the checks below. Report each failing check with its error, or say that every check passed. Don't fix anything here, and don't reset anything: setting up the environment isn't this skill's job. In particular, never run `npm run test-environment:reset`.

## The checks

1. **The tests pass.** Run `node --test "mcp/test/*.test.ts"`. Every test file runs at least one test, and the run counts more than zero tests.
2. **A live run, as the user would.** Use the server against the running test environment (`npm run test-environment`; if it isn't up, say so and stop this check). Speak MCP over stdio to `node mcp/src/<entry>.ts`, once with `MCP_TOKEN=$ROUTA_READONLY_TOKEN` and once with `MCP_TOKEN=$ROUTA_TOKEN`. Read, preview, apply, then read the settings straight from the platform and check the end state is exactly what the preview showed. Undo any change you make by applying the opposite change through the server, so the environment ends as it began.
3. **The client's limits hold.** One check for each row of `brain/limits.md` (L1 to L11), each able to fail. The two that matter most:
   - **L1:** with the read-only token, every tool that previews or applies refuses clearly, and `GET /admin/v1/settings` is identical before and after.
   - **L4:** apply uses only what the preview showed, even if the platform changed in between.
4. **No secrets.** Scan every file in the folder, logs included, and `git log -p`, for the values of `ROUTA_TOKEN` and `ROUTA_READONLY_TOKEN` and for `Authorization` headers that carry a real value. Compare in a script that reads the values from the environment; never print them or read the token files.
5. **Standard library only.** No `node_modules`, no `dependencies` or `devDependencies` in any package.json under `mcp/`, and no import of anything but `node:` modules and local `.ts` files.
