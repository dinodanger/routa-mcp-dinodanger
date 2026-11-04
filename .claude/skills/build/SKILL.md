---
name: build
description: Build the next step of the Routa MCP server. Use after the plan skill has said what to build.
---

Build the step the plan skill chose, with a test for it, following `brain/conventions.md`:

- Code in `mcp/src/` (one file per tool in `mcp/src/tools/`), tests in `mcp/test/<module>.test.ts`.
- Node 22.18+ runs the `.ts` files directly. No `enum`, `namespace` or parameter properties. No npm packages, in the server or the tests: `node:test` and `node:assert/strict` only.
- The server reads `ROUTA_URL` and `MCP_TOKEN`. Never write a token into code, a test, a log or a commit. Tests that need a token get it from the environment or use a fake one against a stub.
- Any tool that changes settings calls `whoami` on that call and refuses unless the scope is `admin`. Nothing is cached between calls.
- Don't touch `/hr/` or `/scim/`, and don't add tools beyond the plan.
- Don't edit `client/`, `test-environment/` or `toolbox/`.

Run the new test with `node --test "mcp/test/<module>.test.ts"`, then the whole suite with `node --test "mcp/test/*.test.ts"`. Mark the step done in `plan.md` when its test passes, and commit, with a one-line message saying what and why.
