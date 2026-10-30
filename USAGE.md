# Usage

One row per agent session. In Gemini CLI, type `/stats` before you quit and copy the input and output tokens. Copilot shows credits instead of tokens: write those in the credits column. The free tier charges nothing, so record what the session **would cost at the provider's published list price**, and note once below the table which price list you used. Leave the cost empty for rows that only show credits.

| Date | Tool | Input tokens | Output tokens | Credits (if no tokens) | List-price cost |
|---|---|---|---|---|---|
| 2026-10-29 | Claude Code (Opus 5.5), desktop app | not reported (context at end: 441,346 tokens) | not reported | Pro plan: 36% of the 5-hour window, 5% of the weekly limit | |
| 2026-10-30 | Claude Code (Opus 5.5), desktop app | not reported (context: 193,198 tokens) | not reported | Pro plan: 5% of the 5-hour window, 8% of the weekly limit | |

The 2026-10-29 row comes from the app's usage panel, which shows plan percentages and the context size, not cumulative input/output tokens; replace it with exact numbers if you can read them (e.g. `/cost` in a `claude` terminal). No list-price cost is given because the token split is unknown.
