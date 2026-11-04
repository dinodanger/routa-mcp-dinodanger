# The client and the ask

Source: `client/brief.md`, `client/context.md`, `client/decisions.md`.

- **Client:** Routa Advisory Oy. Contact: Tuomas Hirvikoski, IT lead.
- **Users:** Tuomas and two administrators use Claude Code with an admin token. Everyone else at Routa uses a read-only token to answer "who can reach what?".
- **Today:** settings are changed one box at a time on a page with 14 groups x 11 applications (154 boxes) and 20 policies.
- **Ask:** an MCP server for the platform's admin API, so IT can say "contractors shouldn't reach finance" and have it done.
- **Scope:** read the access grid and policies; change them behind a preview; check the token on every call. "Keep it to what's above."
- **Order of work:** build the server first. Connecting it to Claude Code, and bringing settings in line with the baseline by asking, come after.
- **A previous project exists** (the HR connector, which runs weekly). This is a new project, not its continuation.

## What good looks like (client's words, condensed)

- Asking is enough; IT doesn't need the API's field names.
- Before anything changes, IT sees it in plain words: which group gains or loses which application, which policy goes from what to what.
- Saying yes applies exactly what was shown.
- A read-only token that tries to change something gets a clear refusal, and nothing changes.

## Decisions on record

| Date | Decision | Who |
| --- | --- | --- |
| 2026-10-20 | Every change goes through a preview first; applying takes the preview's id | Tuomas |
| 2026-10-20 | Tools change one thing asked for; no tool resets the whole grid | Tuomas |
| 2026-10-22 | The server talks only to the admin API; no HR, no SCIM (the connector owns those) | Tuomas, Marja Hämäläinen |
| 2026-10-22 | No session revocation; the platform has none | Tuomas |

## Open questions

- `client/messages/` is empty. If Routa sends messages, put them there.
- How long a preview stays valid is not specified. Decide in the plan and tell the client.
