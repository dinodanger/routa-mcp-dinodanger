---
name: plan
description: Plan the Routa MCP server work. In the loop, decide what to build next. For a new feature, plan it with the user first.
---

Read `brain/README.md` first. The limits in `brain/limits.md` bind every plan.

## In the loop

Read `plan.md`. Pick the first step that isn't done. If all are done and the verify skill reported a failing check, pick the step that fixes it. Say in a few lines what to build next and which files it touches (under `mcp/src/` and `mcp/test/`). Don't write code.

## A new feature

Check the running test environment for what the feature touches (`GET /admin/v1/whoami` and `/admin/v1/settings` with the tokens from the shell; never print a token), and write what the platform actually does in `brain/platform.md`. If the environment isn't running, start it with `npm run test-environment`.

Draft the steps from `client/`. The brief says "keep it to what's above": a feature that goes beyond reading settings, previewed changes and the per-call token check needs the client's yes first. HR, SCIM and session revocation are out (`client/decisions.md`).

Suggest the three ideas that would make it much better, then walk the draft for the three open decisions that matter most. Ask each question with the AskUserQuestion tool, a line of background first, your recommendation first. Then write the steps into `plan.md`, five at most. Don't write code.
