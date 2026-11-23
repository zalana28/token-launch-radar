# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/zalana28/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/zalana28/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A radar for protocols that record no token yet: it reads a sealed snapshot of the DefiLlama protocol index, scores every protocol in it by an implied value refit from the snapshot's own traded comparables, and hands a reader a dashboard with the ranked board, a detail view for each protocol and a farm plan for each one. Entry for the make.fun `token-radar-01` bounty.

## What it does

`main.ts` (Node 22, standard library only) reads `input/snapshot.json`, builds the board with the model in `lib/model.ts`, and writes to the output directory:

- `board.json` — the ranked board, 198 rows: the farmable pre-token protocols only (watchlist 40 + early 138 + off-list 20), ranked 1..198 by implied value, each with a farm plan; the 40-protocol watchlist is fully covered. The other 560 protocols stay out of the ranking and in the ledger.
- `data.js` — the same board in compact form for the dashboard, farm plans included.
- `dashboard/` — the static page (no network, no framework).
- `screenshots/` — three renders of the dashboard: the board, a protocol detail view and a filtered view.
- `dossier.json` — the judge's dossier, written by `vendor/makefun-board.ts`.

## The model (radar-3)

Implied value is refit at runtime from the snapshot's own traded comparables — no hardcoded protocol names, no fixed multiple. Ordinary least squares of log10(market cap) on log10(TVL) and clamped 7-day growth, plus a shrunk category offset, over the 119 traded protocols with a positive market cap and TVL that are not exchanges:

```
log10 implied = intercept + coef_TVL * log10(tvl_usd) + coef_growth * growth + category offset
growth        = clamp(change_7d, -40, 150) / 100    (null growth counts as 0)
category      = shrunk mean residual per category (k = 5)
implied       = round(10 ^ log10 implied), with a P25-P75 band from the residual sd
```

Validated in code: leave-one-out median miss x3.63, walk-forward median miss x2.59 (fit on the earliest-listed 60% of dated comparables), P25-P75 coverage 54%, P10-P90 coverage 90%, token-odds Brier 0.145 against a climatology 0.154. Token odds are peer base rates (category x TVL tercile, smoothed). Net-of-fees verdicts (FARM / MARGINAL / SKIP) price each farmable row at $/hr under stated assumptions: a launch distributes 5% of implied value to farmers, one farmer in two thousand takes a share.

Every protocol lands in exactly one ledger bucket — watchlist 40, early 138, off-list 20, token-trades 144, recorded 272, bridge 43, staking 48, exchange 42, versioned 11 — summing to all 758. Protocols whose token already trades are not ranked: they sit in the ledger, and the model's error on them stays visible in the scatter and ablation panels, not hidden.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

Two runs write identical bytes: every sort has a slug tie-break and nothing in the output depends on the clock or on randomness.

## License

MIT. See `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=n0w15zdz&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
