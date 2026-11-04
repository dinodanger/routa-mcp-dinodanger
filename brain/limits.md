# The client's limits, as checks

Source: `client/brief.md`, `client/context.md`, `client/decisions.md`, `client/conventions.md`. The verify skill runs one check per row.

| # | Limit | A check that can fail |
| --- | --- | --- |
| L1 | A read-only token can't change settings | Run the server with the read-only token and call every tool that previews-and-applies or applies; each refuses clearly, and the settings are identical afterwards |
| L2 | The token is checked on every call | Against a stub platform whose `whoami` scope flips between calls, the server's answer follows the flip |
| L3 | Every change is previewed first; apply takes the preview's id | Apply with no id, or an unknown id, changes nothing |
| L4 | What is applied is what was shown | Preview, change the platform behind the server's back, apply: the server refuses, or applies exactly the previewed changes, never a recomputed set |
| L5 | A preview is in plain words | The preview names groups, apps and policy labels with from -> to, and shows no API field names |
| L6 | Tools change one thing; nothing resets the grid | No tool takes "all"; none rewrites the whole grid or applies the baseline wholesale |
| L7 | Only the admin API | The server makes no request outside `/admin/v1/` (none to `/hr/` or `/scim/`) |
| L8 | No session revocation | No such tool exists |
| L9 | Standard library only, no build step | No `dependencies` in any package.json under `mcp/`, no `node_modules`; the server starts with `node` directly |
| L10 | No secret leaks | No token value in any file, log, test or commit; no `Authorization` header with a real value |
| L11 | Platform errors reach the user clearly | A 400 comes back as plain text with the platform's `detail`, and nothing is partly applied |

## Not yet decided by the client

- How long a preview stays valid.
- What a preview shows for a no-op change.
- Whether read-only users see policies as well as access (the brief says "read the settings": both).
