# The platform's admin API

Source: `client/settings-api.md`, `test-environment/server.ts`, and calls against the running test environment on 2026-11-04. Base URL `http://localhost:4660`; every call takes `Authorization: Bearer <token>`.

## Endpoints (verified)

| Call | Answer |
| --- | --- |
| `GET /admin/v1/whoami` | `{"scope":"admin"}` or `{"scope":"read"}`. Missing or unknown token: 401 `{"status","detail"}`. |
| `GET /admin/v1/settings` | `{"access":[{"group","apps":[...]}],"policies":[{"id","label","value"}]}`. 14 groups, 20 policies. |
| `PATCH /admin/v1/settings` | Body `{"changes":[...]}`. Applies at once; all or none. Answers `{"applied":n,"settings":{...}}`. |

There is no endpoint for apps, groups, policies or an audit log (`/admin/v1/apps`, `/groups`, `/policies`, `/audit` all return 404).

## Change shapes

- Access: `{"type":"access","group":"<name>","app":"<app id>","allowed":true|false}`
- Policy: `{"type":"policy","id":"<policy id>","value":<same type as today's value>}`

## The scope gap (verified)

The API checks that a token is valid, not what it may do. **A read-only token's PATCH succeeded with 200 and applied.** (Tested with a no-op change: password-min-length set to its current value, 14.) The server must call `whoami` and refuse before any PATCH. Check on every call; never cache a scope.

## Vocabulary

- **Groups** are addressed by display name (`managers`, `ext-contractors`). The 14: all-staff, dept-analytics, dept-consulting, dept-finance, dept-it, dept-operations, dept-people, eng-hiidenkivi, eng-lumivaara, eng-merivirta, eng-tammiranta, ext-contractors, managers, partners.
- **Applications** are addressed by id. The 11: bi, crm, documents, finance, hiidenkivi-portal, hr, it-admin, lumivaara-portal, merivirta-portal, tammiranta-portal, timesheets. The settings response never lists them; this list comes from the settings page's columns. An app that no group reaches is invisible in the API response.
- **Policies** (20): `mfa.<group>` booleans (one per group), `session-length-hours` (number), `legacy-sign-in` (boolean), `guest-access` (string; today `open`, baseline `invite-only`), `password-min-length`, `token-lifetime-days`, `audit-log-days` (numbers). Each policy's `label` is plain English; use it in previews.

## Errors (verified)

All are 400 with `{"status":"400","detail":...}`, and nothing is applied:

- unknown group: `No group called "x".`
- unknown app: `No application called "x".`
- policy value of the wrong type: `session-length-hours takes a number.` (the string "8" is refused)
- also: `allowed must be true or false.`, empty or missing `changes`, unknown change `type`.

Changes are checked in order, so a bad group hides a bad app in the same change.

## Differences from the docs

- `client/settings-api.md` doesn't say groups are matched by display name, or that a policy value must have the same type as today's value. Both are true.
- A string policy (`guest-access`) takes any string. The API doesn't know the allowed values. The baseline only shows `invite-only`; don't invent others.
- Setting a value to what it already is succeeds and counts as applied. A preview should say "no change" for these, not list them as changes.

## The settings page

`http://localhost:4660/admin/settings` takes no token and changes settings (`POST /admin/settings/click`). It plays the console IT uses today. It sits outside the MCP server, so the server's token check can't cover it. Tell the client; don't try to fix it.

## Test environment

- Start: `npm run test-environment` (Node 22.18+). Port 4660; `PORT` and `DATA_DIR` start another copy.
- Reset: `npm run test-environment:reset`. Only the user asks for this.
- Tokens: `ROUTA_TOKEN` (admin) and `ROUTA_READONLY_TOKEN` are in the shell. The files behind them are denied to Claude by `.claude/settings.json`. Never print, log or commit a token.
- State survives restarts, in `test-environment/.data/` (gitignored).
