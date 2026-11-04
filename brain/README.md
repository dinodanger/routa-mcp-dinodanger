# Project brain: Routa identity MCP server

Start here. Each file says what it is sourced from. "Verified" means checked against the running test environment on 2026-11-04; everything else is from `client/` and unverified.

| File | Holds |
| --- | --- |
| [client.md](client.md) | Who Routa is, who uses the server, what they asked for, what is out of scope |
| [platform.md](platform.md) | What the platform's admin API actually does (verified) |
| [limits.md](limits.md) | The client's limits, each one phrased so it can be checked |
| [conventions.md](conventions.md) | Language, layout, config and style rules |
| [baseline.md](baseline.md) | The security baseline and today's drift from it |

When `client/` and a verified fact disagree, the verified fact wins and the disagreement is listed in `platform.md` under "Differences from the docs".
