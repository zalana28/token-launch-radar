# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/zalana28/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/zalana28/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A radar for protocols that record no token yet: it reads a sealed snapshot of the DefiLlama protocol index, scores every pre-token protocol by an implied value the snapshot's own figures produce, and hands a reader a dashboard with the ranked board, a detail view for each protocol and a farm plan for each one. Entry for the make.fun `token-radar-01` bounty.

## What it does

`main.ts` (Node 22, standard library only) reads `input/snapshot.json`, builds the board with the model in `lib/model.ts`, and writes to the output directory:

- `board.json` — the ranked board, 226 rows: the 40-protocol watchlist plus every rankable pre-token protocol below the watchlist floor, ranked 1..N by implied value, each with a 7-step farm plan.
- `data.js` — the same board in compact form for the dashboard, farm plans included.
- `dashboard/` — the static page (no network, no framework).
- `screenshots/` — three renders of the dashboard: the board, a protocol detail view and a filtered view.
- `dossier.json` — the judge's dossier, written by `vendor/makefun-board.ts`.

## The model (radar-2)

Implied value follows only from the snapshot's own figures — TVL, seven-day growth, age with no token, and how many chains the protocol runs on. No protocol name is special-cased.

```
growth     = clamp(change_7d, -40, 150)            (per cent; null growth is 0)
growthMult = 1 + growth / 100 * 0.6
maturity   = 0.5 + min(age_days, 730) / 730 * 0.5   (unknown age: 270 days)
breadth    = min(1.30, 1 + 0.10 * ln(chains))       (1 chain: 1.00)
implied    = max(1, round(tvl_usd * 0.30 * growthMult * maturity * breadth))
```

Protocols whose token already trades are set aside in a separate live view with their market caps shown — the market's own values, never a model's.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

Two runs write identical bytes: every sort has a slug tie-break and nothing in the output depends on the clock or on randomness.

## License

MIT. See `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=n0w15zdz&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
