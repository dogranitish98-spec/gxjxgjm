# Changelog

## GitHub-ready pass

- Regenerated `package-lock.json` (it was out of sync, so `npm ci` failed).
- Fixed lint: 1 error (empty `catch`) and 5 warnings (unused vars / directive).
- Tests: Synaptick domain tests (`src/lib/synaptick/*.test.ts`, 34 tests) were never run by
  `npm test`; they now run via `tsx`. Made the PWA head-injection tests independent of this repo's
  branding and updated the stale migration test. Tests that read Grok agent docs skip when those
  docs are absent.
- Added `.gitignore`, `.env.example`, CI workflow, `engines`, package name/version, README update.
- Removed workspace-only files (agent skills, build output, attachments, generated images).

## Surgical cleanup (4 issues)

1. `closePosition` uses `netPnl()` from `costs.ts` for gross + fee breakdown (numbers unchanged).
2. Removed dead `remainingCost` / `net` / no-op from `netPnl()`.
3. Migration `0004_drop_paper_trade_links.sql` drops superseded table.
4. `performance.ts` uses `ROUND_TRIP_COST_PCT / 2` instead of magic `0.13`.

## Prior hardening

- Paper cash/PnL fix (SELL close, no double entry slip)
- Research memory + History UI
- UI/UX: VerdictBanner, mobile nav, paper journal
