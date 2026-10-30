# Usage

One row per agent session. In Gemini CLI, type `/stats` before you quit and copy the input and output tokens. Copilot shows credits instead of tokens: write those in the credits column. The free tier charges nothing, so record what the session **would cost at the provider's published list price**, and note once below the table which price list you used. Leave the cost empty for rows that only show credits.

| Date | Tool | Input tokens | Output tokens | Credits (if no tokens) | List-price cost |
|---|---|---|---|---|---|
| 2026-10-29 | Claude Code (Opus 5.5), desktop app | not reported (context at end: 441,346 tokens) | not reported | Pro plan: 36% of the 5-hour window, 5% of the weekly limit | |
| 2026-10-30 | Claude Code (Opus 5.5), desktop app | not reported (context: 193,198 tokens) | not reported | Pro plan: 5% of the 5-hour window, 8% of the weekly limit | |
| 2026-10-30 | Claude Code (Opus 5.5), desktop app: READINESS.md, DEFENSE.md, MCP evidence | not reported (context: 202,633 tokens) | not reported | Pro plan: 32% of the 5-hour window, 11% of the weekly limit | |
| 2026-10-30 | Gemini API, `gemini-3.5-flash-lite`: description experiment (10 calls) and token measurement (3 calls) | 6,253 | 306 | | $0.0026 |

The 2026-10-29 row comes from the app's usage panel, which shows plan percentages and the context size, not cumulative input/output tokens; replace it with exact numbers if you can read them (e.g. `/cost` in a `claude` terminal). No list-price cost is given because the token split is unknown.

The Gemini row is priced at the Gemini API Standard tier list price from
https://ai.google.dev/gemini-api/docs/pricing, checked on 30.10.2026: $0.30 per 1M input tokens and
$2.50 per 1M output tokens. The key is on the free tier, so nothing was charged. The token counts
are Gemini's own `usageMetadata`. They leave out the one draft request sent through the app during
the security checks, which was not counted.
