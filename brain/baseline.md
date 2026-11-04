# The security baseline

Source: `client/security-baseline.json` (owner Tuomas Hirvikoski, agreed 2026-10-20). Compare with `npm run baseline:check` (read-only, needs `ROUTA_TOKEN`).

Bringing settings in line with the baseline comes after the server is built and connected to Claude Code. It is not part of the server.

## Drift in the test environment (verified 2026-11-04, 9 settings)

| Setting | Now | Baseline |
| --- | --- | --- |
| dept-analytics reaches hr | yes | no |
| ext-contractors reaches crm | yes | no |
| ext-contractors reaches finance | yes | no |
| managers reaches it-admin | yes | no |
| mfa.ext-contractors | false | true |
| mfa.partners | false | true |
| session-length-hours | 24 | 8 |
| legacy-sign-in | true | false |
| guest-access | "open" | "invite-only" |

Everything else matches. Re-run the check rather than trusting this table.
