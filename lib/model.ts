// Token Launch Radar — the radar-3 model.
//
// One sealed snapshot of the protocol universe in, one ranked board out. The
// board ranks ONLY the farmable pre-token protocols — watchlist, early and
// off-list, 198 rows in this snapshot — by implied value, so rank 1 is a
// launch candidate, never a traded-token exchange. Every one of the 758
// protocols in the snapshot is still accounted for in exactly one ledger
// bucket (see bucketOf), and the ledger, the fit and the validation all run
// over the whole snapshot. A protocol "records no token"
// when its record carries no CoinGecko id and no symbol; it "records a token"
// when an id or a symbol is present; its token "trades" when a market cap is
// recorded. The board never says a protocol "has no token".
//
// The implied value is REFIT at runtime from the snapshot's own traded
// comparables — no hardcoded protocol names, no hardcoded per-protocol
// values, no fixed multiple. The fit is ordinary least squares of
// log10(market cap) on log10(TVL) and clamped 7-day growth, plus a
// shrinkage (ridge-style) category offset, over every traded protocol with a
// positive market cap and TVL that is not an exchange. The same fitted curve
// scores every row, traded or not, so a traded row's implied value can be
// read against the market cap the snapshot records — that gap is the model's
// validation, not a second model.
//
//   logPred  = b0 + b1 * log10(tvl_usd) + b2 * growth
//   growth   = clamp(change_7d, -40, 150) / 100   (null growth counts as 0)
//   logPred += categoryOffset[category]           (shrunk mean residual, k=5)
//   implied  = round(10 ^ logPred)
//   P25-P75  = 10 ^ (logPred +/- 0.6745 * sigma)  (sigma = residual sd)
//
// Validation is computed in code, from the same comps, and reported
// honestly: leave-one-out error (refit without each comp), a walk-forward
// miss (fit on the earliest-listed 60% of dated comps, test on the rest),
// range honesty (the share of comps whose market cap lands inside the
// P25-P75 and P10-P90 bands), token-odds calibration (a Brier score against
// the climatology rate), and an ablation table (the same leave-one-out
// error with each term removed). The snapshot's market caps are noisy
// against TVL — the numbers say so, and the dashboard says so too.
//
// Token odds are peer base rates, computed at runtime: the smoothed share
// of protocols that already trade a token among protocols in the same
// category and the same TVL tercile, falling back to the category rate and
// then the global rate when a cell is thin. Odds are a base rate, not a
// prediction that a token will launch.
//
// Net-of-fees verdicts price a farm: the expected gross is the odds times
// the implied value times the assumed farmer pool (5% of implied value
// shared among farmers, one farmer in two thousand — stated assumptions,
// not facts), minus gas and the opportunity cost of locked capital, divided
// by the hours the plan takes. FARM at $25/hr or more, MARGINAL at $8/hr
// or more, SKIP below that. Only farmable pre-token rows (watchlist, early,
// off-list) can earn FARM or MARGINAL; every other bucket is SKIP with the
// reason stated, because there is no launch left to farm.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** One ledger bucket. Every protocol lands in exactly one. */
export type Bucket =
  | 'watchlist'
  | 'early'
  | 'off-list'
  | 'token-trades'
  | 'recorded'
  | 'bridge'
  | 'staking'
  | 'exchange'
  | 'versioned';

/** Whether the record shows a token, and whether it trades. */
export type TokenStatus = 'pre-token' | 'recorded' | 'token-trades';

/** A verdict on farming the protocol, net of fees. */
export type Verdict = 'FARM' | 'MARGINAL' | 'SKIP';

/** The fitted curve and the validation the code computed from it. */
export interface Fit {
  comps: number;
  intercept: number;
  log_tvl_coef: number;
  growth_coef: number;
  sigma: number;
  category_offsets: Record<string, number>;
  category_shrinkage_k: number;
  growth_floor: number;
  growth_cap: number;
}

/** One ablation row: the leave-one-out error with a term removed. */
export interface AblationRow {
  variant: string;
  loo_median_dex: number;
  loo_median_factor: number;
}

/** The validation numbers, all computed at runtime from the snapshot. */
export interface Validation {
  loo_median_dex: number;
  loo_median_factor: number;
  loo_mean_dex: number;
  walkforward_median_dex: number;
  walkforward_factor: number;
  walkforward_train: number;
  walkforward_test: number;
  coverage_25_75: number;
  coverage_10_90: number;
  brier: number;
  brier_climatology: number;
  ablation: AblationRow[];
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: TokenStatus;
  bucket: Bucket;
  age_days: number | null;
  implied_value_usd: number;
  implied_p25_usd: number;
  implied_p75_usd: number;
  token_odds: number;
  verdict: Verdict;
  verdict_reason: string;
  dollars_per_hour: number;
  expected_gross_usd: number;
  farm_cost_usd: number;
  farm_hours: number;
  model: {
    log_tvl: number;
    growth_pct: number;
    intercept: number;
    tvl_term: number;
    growth_term: number;
    category: string | null;
    category_offset: number;
    log_pred: number;
    sigma: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, farm plan included. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  token_status: TokenStatus;
  bucket: Bucket;
  implied_value_usd: number;
  implied_p25_usd: number;
  implied_p75_usd: number;
  token_odds: number;
  verdict: Verdict;
  verdict_reason: string;
  dollars_per_hour: number;
  log_tvl: number;
  growth_pct: number;
  tvl_term: number;
  growth_term: number;
  category_offset: number;
  log_pred: number;
  farm_steps: string[];
}

/** One traded comparable, for the dashboard's scatter. */
export interface CompPoint {
  slug: string;
  log_tvl: number;
  log_mcap: number;
  category: string | null;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  fit: Fit;
  validation: Validation;
  ledger: Record<Bucket, number>;
  ledger_total: number;
  watchlist_size: number;
  watchlist_covered: number;
  board_size: number;
  farmable_size: number;
  worth_farming: number;
  rows: RadarRow[];
  comps: CompPoint[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

export const MODEL_VERSION = 'radar-3';

/** The farmer-pool assumptions behind every $/hr verdict (stated, not measured). */
export const ECONOMICS = {
  farmer_pool_share: 0.05,
  farmer_share: 0.0005,
  farm_threshold_usd_per_hour: 25,
  marginal_threshold_usd_per_hour: 8,
  capital_apr: 0.05,
};

const DAY_MS = 86_400_000;
const CAT_SHRINK_K = 5;
const GROWTH_FLOOR = -40;
const GROWTH_CAP = 150;

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether the record carries no token at all: no CoinGecko id and no symbol. */
export function recordsNoToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** The token status the record shows: no token, a token recorded, or a token trading. */
export function tokenStatus(p: SnapshotProtocol): TokenStatus {
  if (p.mcap_usd !== null) return 'token-trades';
  if (!recordsNoToken(p)) return 'recorded';
  return 'pre-token';
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const BRIDGE_CATS = new Set(['Bridge', 'Canonical Bridge']);
const STAKING_CATS = new Set(['Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/**
 * The ledger bucket: one per protocol, in priority order, so the buckets are
 * mutually exclusive and sum to the snapshot. The watchlist first (it is
 * pre-token by the house rule); then the traded and recorded rows; then the
 * excluded kinds of pre-token protocol; then the above-floor pre-token rows
 * the watchlist left out; then the early rows below the floor.
 */
export function bucketOf(p: SnapshotProtocol, watchlist: Set<string>): Bucket {
  if (watchlist.has(p.slug)) return 'watchlist';
  if (p.mcap_usd !== null) return 'token-trades';
  if (!recordsNoToken(p)) return 'recorded';
  if (p.category === 'CEX') return 'exchange';
  if (VERSIONED.test(p.name)) return 'versioned';
  if (p.category !== null && BRIDGE_CATS.has(p.category)) return 'bridge';
  if ((p.category !== null && STAKING_CATS.has(p.category)) || WRAPPED_WORD.test(p.name)) return 'staking';
  if (p.tvl_usd >= 50_000_000) return 'off-list';
  return 'early';
}

/** Whether a row can be farmed for a launch: pre-token and not an excluded kind. */
export function isFarmable(bucket: Bucket): boolean {
  return bucket === 'watchlist' || bucket === 'early' || bucket === 'off-list';
}

// ---------------------------------------------------------------- the fit

/** The traded comparables the curve is refit from: a positive market cap and TVL, not an exchange. */
export function tradedComps(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX',
  );
}

/** The growth feature: clamped 7-day change, as a fraction (null counts as 0). */
function growthFrac(p: SnapshotProtocol): number {
  return clamp(finite(p.change_7d, 0), GROWTH_FLOOR, GROWTH_CAP) / 100;
}

/** Solve a small dense linear system by Gaussian elimination with partial pivoting. */
function solveLinear(aIn: number[][], bIn: number[]): number[] {
  const n = bIn.length;
  const m = aIn.map((row, i) => [...row, bIn[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    const tmp = m[c]!;
    m[c] = m[piv]!;
    m[piv] = tmp;
    const div = m[c]![c]!;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r]![c]! / div;
      for (let cc = c; cc <= n; cc++) m[r]![cc] = m[r]![cc]! - f * m[c]![cc]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

type FeatureSet = 'full' | 'tvl-only' | 'no-growth' | 'no-category';

/** The design row for a protocol under a feature set. */
function features(p: SnapshotProtocol, set: FeatureSet): number[] {
  const row: number[] = [1, Math.log10(p.tvl_usd)];
  if (set === 'full' || set === 'no-category') row.push(growthFrac(p));
  return row;
}

/** OLS of log10(mcap) on the feature set, over the given comps. */
function ols(comps: SnapshotProtocol[], set: FeatureSet): { beta: number[]; residuals: number[] } {
  const xs = comps.map((p) => features(p, set));
  const ys = comps.map((p) => Math.log10(p.mcap_usd!));
  const k = xs[0]!.length;
  const xtx: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const xty: number[] = new Array<number>(k).fill(0);
  for (let i = 0; i < comps.length; i++) {
    for (let a = 0; a < k; a++) {
      xty[a] = xty[a]! + xs[i]![a]! * ys[i]!;
      for (let b = 0; b < k; b++) xtx[a]![b] = xtx[a]![b]! + xs[i]![a]! * xs[i]![b]!;
    }
  }
  const beta = solveLinear(xtx, xty);
  const residuals = comps.map((p, i) => ys[i]! - xs[i]!.reduce((s, x, j) => s + x * beta[j]!, 0));
  return { beta, residuals };
}

/** Shrunk category offsets: each category's mean residual, pulled toward 0 by k. */
function categoryOffsets(comps: SnapshotProtocol[], residuals: number[]): Record<string, number> {
  const sums = new Map<string, { sum: number; n: number }>();
  comps.forEach((p, i) => {
    const cat = p.category ?? '(none)';
    const e = sums.get(cat) ?? { sum: 0, n: 0 };
    e.sum += residuals[i]!;
    e.n += 1;
    sums.set(cat, e);
  });
  const out: Record<string, number> = {};
  for (const [cat, e] of [...sums.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    out[cat] = e.sum / (e.n + CAT_SHRINK_K);
  }
  return out;
}

/** The fitted log10 implied value of a protocol (category offset included when the set uses it). */
function logPredict(
  p: SnapshotProtocol,
  beta: number[],
  set: FeatureSet,
  offsets: Record<string, number>,
): number {
  const base = features(p, set).reduce((s, x, j) => s + x * beta[j]!, 0);
  if (set === 'no-category' || set === 'tvl-only') return base;
  return base + (offsets[p.category ?? '(none)'] ?? 0);
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/** Leave-one-out median absolute log error for a feature set (refit without each comp). */
function looMedian(comps: SnapshotProtocol[], set: FeatureSet): number {
  const errs: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const train = comps.filter((_, j) => j !== i);
    const { beta, residuals } = ols(train, set);
    const offsets = set === 'full' || set === 'no-growth' ? categoryOffsets(train, residuals) : {};
    const pred = logPredict(comps[i]!, beta, set, offsets);
    errs.push(Math.abs(Math.log10(comps[i]!.mcap_usd!) - pred));
  }
  return median(errs);
}

/** Fit the curve and validate it, all from the snapshot's own traded comps. */
export function fitModel(snapshot: Snapshot): { fit: Fit; validation: Validation; comps: SnapshotProtocol[] } {
  const comps = tradedComps(snapshot);
  if (comps.length < 10) throw new SnapshotError(`only ${comps.length} traded comparables: the curve cannot be refit`);
  const { beta, residuals } = ols(comps, 'full');
  const offsets = categoryOffsets(comps, residuals);
  const residAfter = comps.map((p, i) => residuals[i]! - (offsets[p.category ?? '(none)'] ?? 0));
  const sigma = Math.sqrt(residAfter.reduce((s, e) => s + e * e, 0) / Math.max(1, comps.length - 3));

  const fit: Fit = {
    comps: comps.length,
    intercept: beta[0]!,
    log_tvl_coef: beta[1]!,
    growth_coef: beta[2]!,
    sigma,
    category_offsets: offsets,
    category_shrinkage_k: CAT_SHRINK_K,
    growth_floor: GROWTH_FLOOR,
    growth_cap: GROWTH_CAP,
  };

  // Leave-one-out on the full model.
  const looErrs: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const train = comps.filter((_, j) => j !== i);
    const f = ols(train, 'full');
    const off = categoryOffsets(train, f.residuals);
    looErrs.push(Math.abs(Math.log10(comps[i]!.mcap_usd!) - logPredict(comps[i]!, f.beta, 'full', off)));
  }
  const looMedianDex = median(looErrs);
  const looMeanDex = looErrs.reduce((s, e) => s + e, 0) / looErrs.length;

  // Walk-forward: fit on the earliest-listed 60% of dated comps, test on the rest.
  const dated = comps
    .filter((p) => p.listed_at !== null)
    .sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
  const cut = Math.floor(dated.length * 0.6);
  const trainW = dated.slice(0, cut);
  const testW = dated.slice(cut);
  let walkforwardMedianDex = NaN;
  if (trainW.length >= 10 && testW.length > 0) {
    const f = ols(trainW, 'full');
    const off = categoryOffsets(trainW, f.residuals);
    walkforwardMedianDex = median(
      testW.map((p) => Math.abs(Math.log10(p.mcap_usd!) - logPredict(p, f.beta, 'full', off))),
    );
  }

  // Range honesty: the share of comps inside the P25-P75 and P10-P90 bands.
  const in2575 = residAfter.filter((e) => Math.abs(e) <= 0.6745 * sigma).length / residAfter.length;
  const in1090 = residAfter.filter((e) => Math.abs(e) <= 1.6449 * sigma).length / residAfter.length;

  // Token-odds calibration over every protocol in the snapshot.
  const odds = tokenOddsMap(snapshot);
  let brier = 0;
  let traded = 0;
  for (const p of snapshot.protocols) {
    const y = p.mcap_usd !== null ? 1 : 0;
    traded += y;
    const o = odds.get(p.slug) ?? 0;
    brier += (o - y) * (o - y);
  }
  brier /= snapshot.protocols.length;
  const pBar = traded / snapshot.protocols.length;
  const brierClimatology = pBar * (1 - pBar);

  // Ablation: the same leave-one-out error with each term removed.
  const ablation: AblationRow[] = (
    [
      ['full model (log TVL + growth + category)', 'full'],
      ['TVL only (no growth, no category)', 'tvl-only'],
      ['no growth (log TVL + category)', 'no-growth'],
      ['no category (log TVL + growth)', 'no-category'],
    ] as [string, FeatureSet][]
  ).map(([variant, set]) => {
    const m = looMedian(comps, set);
    return { variant, loo_median_dex: round4(m), loo_median_factor: round4(Math.pow(10, m)) };
  });

  const validation: Validation = {
    loo_median_dex: round4(looMedianDex),
    loo_median_factor: round4(Math.pow(10, looMedianDex)),
    loo_mean_dex: round4(looMeanDex),
    walkforward_median_dex: round4(walkforwardMedianDex),
    walkforward_factor: round4(Math.pow(10, walkforwardMedianDex)),
    walkforward_train: trainW.length,
    walkforward_test: testW.length,
    coverage_25_75: round4(in2575),
    coverage_10_90: round4(in1090),
    brier: round4(brier),
    brier_climatology: round4(brierClimatology),
    ablation,
  };
  return { fit, validation, comps };
}

/** The implied value and its band for one protocol under the fitted curve. */
export function impliedFor(
  p: SnapshotProtocol,
  fit: Fit,
): { implied: number; p25: number; p75: number; logPred: number; logTvl: number; growthPct: number; tvlTerm: number; growthTerm: number; catOffset: number } {
  const logTvl = Math.log10(p.tvl_usd);
  const growthPct = clamp(finite(p.change_7d, 0), fit.growth_floor, fit.growth_cap);
  const tvlTerm = fit.log_tvl_coef * logTvl;
  const growthTerm = fit.growth_coef * (growthPct / 100);
  const catOffset = fit.category_offsets[p.category ?? '(none)'] ?? 0;
  const logPred = fit.intercept + tvlTerm + growthTerm + catOffset;
  const implied = Math.max(1, Math.round(Math.pow(10, logPred)));
  const p25 = Math.max(1, Math.round(Math.pow(10, logPred - 0.6745 * fit.sigma)));
  const p75 = Math.max(1, Math.round(Math.pow(10, logPred + 0.6745 * fit.sigma)));
  return { implied, p25, p75, logPred, logTvl, growthPct, tvlTerm, growthTerm, catOffset };
}

// ---------------------------------------------------------------- token odds

/** TVL tercile cut points over the whole snapshot, in log10 dollars. */
function tvlTerciles(snapshot: Snapshot): [number, number] {
  const xs = snapshot.protocols.map((p) => Math.log10(p.tvl_usd)).sort((a, b) => a - b);
  return [xs[Math.floor(xs.length / 3)]!, xs[Math.floor((2 * xs.length) / 3)]!];
}

/** Peer base-rate token odds for every protocol, by category x TVL tercile with fallbacks. */
export function tokenOddsMap(snapshot: Snapshot): Map<string, number> {
  const [t1, t2] = tvlTerciles(snapshot);
  const tercile = (p: SnapshotProtocol): number => {
    const x = Math.log10(p.tvl_usd);
    return x < t1 ? 0 : x < t2 ? 1 : 2;
  };
  const cell = new Map<string, { n: number; t: number }>();
  const cat = new Map<string, { n: number; t: number }>();
  let gn = 0;
  let gt = 0;
  for (const p of snapshot.protocols) {
    const y = p.mcap_usd !== null ? 1 : 0;
    gn += 1;
    gt += y;
    const ck = `${p.category ?? '(none)'}|${tercile(p)}`;
    const c = cell.get(ck) ?? { n: 0, t: 0 };
    c.n += 1;
    c.t += y;
    cell.set(ck, c);
    const k = p.category ?? '(none)';
    const g = cat.get(k) ?? { n: 0, t: 0 };
    g.n += 1;
    g.t += y;
    cat.set(k, g);
  }
  const global = (gt + 2) / (gn + 4);
  const out = new Map<string, number>();
  for (const p of snapshot.protocols) {
    const ck = `${p.category ?? '(none)'}|${tercile(p)}`;
    const c = cell.get(ck)!;
    if (c.n >= 6) {
      out.set(p.slug, (c.t + 2) / (c.n + 4));
      continue;
    }
    const g = cat.get(p.category ?? '(none)')!;
    if (g.n >= 6) out.set(p.slug, (g.t + 2) / (g.n + 4));
    else out.set(p.slug, global);
  }
  return out;
}

// ---------------------------------------------------------------- farm plans

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 300;
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 180) return 90;
  if (age < 365) return 60;
  return 45;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The category's core action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateralized debt'))
    return `Lend $${capital} of USDC on ${name} (${chain}) and leave the loan open so the position accrues.`;
  if (c.includes('dex') || c.includes('exchange'))
    return `Add $${capital} of liquidity to ${name}'s deepest pool on ${chain} and hold the LP tokens.`;
  if (c.includes('yield aggregator') || c.includes('yield'))
    return `Deposit $${capital} of USDC into ${name}'s highest-TVL vault on ${chain} and keep the receipt.`;
  if (c.includes('canonical bridge') || c.includes('bridge'))
    return `Bridge $${capital} of USDC into ${chain} with ${name}, then put the bridged funds to work in its app.`;
  if (c.includes('liquid restaking') || c.includes('restak'))
    return `Restake $${capital} of the chain's liquid staking token through ${name} and keep the receipt token.`;
  if (c.includes('liquid staking'))
    return `Stake $${capital} of the chain's native asset through ${name} and keep the liquid staking receipt.`;
  if (c.includes('perpetual') || c.includes('derivatives') || c.includes('derivative'))
    return `Post $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('prediction'))
    return `Fund a $${capital} balance on ${name} and take one position in an open market.`;
  if (c.includes('risk curator') || c.includes('curator'))
    return `Allocate $${capital} to a ${name} curator vault on ${chain} and keep the vault shares.`;
  if (c.includes('onchain capital allocator') || c.includes('allocator'))
    return `Deposit $${capital} into an allocator vault run by ${name} on ${chain} and keep the shares.`;
  if (c.includes('stablecoin') || c.includes('stable'))
    return `Mint or hold $${capital} of the stable asset ${name} issues on ${chain}.`;
  if (c.includes('rwa'))
    return `Mint $${capital} of ${name}'s tokenised yield asset on ${chain} and hold it.`;
  if (c.includes('insurance'))
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('options'))
    return `Deposit $${capital} of USDC into ${name}'s options vault on ${chain} and keep the position.`;
  if (c.includes('farm'))
    return `Stake $${capital} of LP tokens in ${name}'s farm on ${chain} and keep the stake.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A second, different qualifying action on the same protocol, where one exists. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string | null {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateralized debt'))
    return `Borrow a small amount against the deposit on ${name} and repay it in the same week, so the account shows both sides.`;
  if (c.includes('dex') || c.includes('exchange'))
    return `Swap a small amount through ${name} on ${chain} once a week, in addition to the liquidity position.`;
  if (c.includes('bridge') || c.includes('canonical bridge'))
    return `Bridge a second, smaller amount back the other way through ${name} so the account shows round-trip use.`;
  if (c.includes('staking') || c.includes('restak'))
    return `Claim and restake any staking rewards ${name} pays, instead of leaving them unclaimed.`;
  if (c.includes('perpetual') || c.includes('derivatives') || c.includes('derivative'))
    return `Close and reopen the hedge once, so the account shows a full trade cycle on ${name}.`;
  if (c.includes('yield') || c.includes('curator') || c.includes('allocator'))
    return `Top up the vault by $${Math.max(10, Math.round(capital / 5))} once, so the account shows more than one deposit.`;
  if (c.includes('prediction'))
    return `Settle one market on ${name} and place a second position in a different market.`;
  if (c.includes('stablecoin') || c.includes('stable'))
    return `Use the minted stable asset in one on-chain swap on ${chain}, so it moves instead of sitting idle.`;
  if (c.includes('rwa'))
    return `Check ${name}'s redemption window once and note the fee, so you can exit cleanly later.`;
  if (c.includes('insurance'))
    return `Read ${name}'s claims page once, so you know the exact steps if a claim is ever needed.`;
  return `Use one more feature of ${name} on ${chain} — a vote, a second pool or a second vault — once.`;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Keep the position open and check the protocol's own page for its points.`;
  return s;
}

/**
 * A protocol's farm plan, by bucket. Farmable rows get a seven-step plan
 * built from the protocol's own record (category, chains, TVL, age). Every
 * other bucket gets a plan that says plainly why there is no launch to farm
 * and what to do instead. Every step names what it costs and how long it
 * takes; nothing here promises a token will exist or that farming is rewarded.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, bucket: Bucket): FarmStep[] {
  const chain = chainOf(p);
  const second = p.chains.length > 1 ? p.chains[1]! : null;
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 200 ? 10 : capital >= 100 ? 6 : 4;
  const core = actionFor(p, capital, chain);
  const secondAction = secondActionFor(p, capital, chain);

  if (bucket === 'token-trades') {
    return [
      { text: `Open the market page for ${p.name}'s token and write down its market cap and the implied value this radar fits; a token trading far above its fitted value is a token the model would not chase.`, cost: 'no fee to check', time: '10 minutes' },
      { text: `If you already hold the token, decide a written exit: the price at which you sell half and the price at which you sell the rest, before you open any new position.`, cost: 'nothing to decide', time: '10 minutes' },
      { text: `To earn yield on the token instead of betting on a launch, stake it or add $${capital} of token plus USDC liquidity on ${chain} only where the pool's own page shows the yield.`, cost: `$${capital} of capital and about $${gas} of gas`, time: '15 minutes to set up' },
      { text: `Check the protocol's own rewards page once a week and claim only from the link it publishes; never pay anyone to claim for you.`, cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: `Hold the position for at least ${hold} days and keep a log of every transaction hash, so the exit is planned instead of improvised.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
      { text: `Compare the token's market cap with this radar's fitted value once a month; when the market cap is more than twice the fitted value, take profit instead of adding.`, cost: 'no fee to check', time: '10 minutes a month' },
      { text: `Plan the exit in writing: how you unwind, what slippage you accept and what the gas costs, then unwind in one planned move.`, cost: 'nothing but the log', time: '10 minutes' },
    ];
  }
  if (bucket === 'recorded') {
    return [
      { text: `${p.name} already records a token identifier in the snapshot, so there is no launch left to farm here; verify on the protocol's own page whether that token trades anywhere before spending anything.`, cost: 'no fee to check', time: '10 minutes' },
      { text: `Search the protocol's own announcements for the token's contract address and check it matches the one the protocol publishes; a mismatched address is a scam, not a farm.`, cost: 'no fee to check', time: '10 minutes' },
      { text: `If the token trades, treat it as a token-trades row: compare its market cap with this radar's fitted value before buying any of it.`, cost: 'no fee to check', time: '10 minutes' },
      { text: `If the token does not trade yet, join only the protocol's own announcement channel and wait for its own listing notice; never buy a pre-listing offer from a third party.`, cost: 'nothing to join', time: '5 minutes' },
      { text: `Do not send funds to any address that claims to sell the token early; a real launch sells through the protocol's own page or a named exchange.`, cost: 'nothing; this step saves money', time: '5 minutes' },
      { text: `Re-check this radar's board after the next snapshot: a recorded token that starts trading moves to the token-trades bucket with a market cap.`, cost: 'no fee to check', time: '5 minutes' },
      { text: `Write the token's identifier, the contract address you verified and the date you checked in a log, so a later check is a comparison, not a fresh guess.`, cost: 'nothing but the log', time: '5 minutes' },
    ];
  }
  if (bucket === 'bridge' || bucket === 'staking' || bucket === 'exchange' || bucket === 'versioned') {
    const why =
      bucket === 'bridge'
        ? 'a bridge moves other protocols\' assets, so its own launch would price the bridge, not a new economy'
        : bucket === 'staking'
          ? 'a staked or wrapped product is another protocol\'s token in a wrapper, so there is no new token of its own to farm'
          : bucket === 'exchange'
            ? 'an exchange is a trading venue, and its token, where one exists, is the venue\'s own — not a protocol launch'
            : 'a versioned pool is one release of a protocol that already exists, so its launch, if any, belongs to the parent protocol';
    return [
      { text: `${p.name} sits in the ${bucket} bucket because it is ${why}; farming it for a launch wastes gas that a farmable row would use better.`, cost: 'no fee to check', time: '5 minutes' },
      { text: `If you still want exposure to ${p.name}, use it for what it is: ${bucket === 'bridge' ? `bridge $${capital} through it once and check the fee and the arrival time` : bucket === 'staking' ? `stake $${capital} through it and keep the receipt token` : bucket === 'exchange' ? `trade $${capital} through it once and check the fee` : `use the current release of ${p.name} once, with $${capital}, and note the version`}.`, cost: `$${capital} of capital and about $${gas} of gas`, time: '15 minutes' },
      { text: `Check the protocol's own page for a points or rewards programme before you spend anything; a wrapper with no programme pays nothing for farming.`, cost: 'no fee to check', time: '10 minutes' },
      { text: `Never pay anyone who offers early access to a token for ${p.name}; a real launch is announced on the protocol's own page, not sold in a chat.`, cost: 'nothing; this step saves money', time: '5 minutes' },
      { text: `Put the same $${capital} to work on a farmable row of this board instead — a watchlist or early protocol in the same category — and log which row you chose.`, cost: `$${capital} of capital and about $${gas} of gas`, time: '15 minutes' },
      { text: `Hold that farmable position for at least ${hold} days, so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
      { text: `Write the wallet, the dates and every transaction hash in a farm log, then plan the exit: how you unwind, what slippage you accept and what the gas costs.`, cost: 'nothing but the log', time: '10 minutes' },
    ];
  }

  // Farmable rows: watchlist, early, off-list.
  const steps: FarmStep[] = [
    { text: `Open a fresh wallet that holds only the funds you plan to farm, and store its seed phrase offline, never in a screenshot or a chat.`, cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: core, cost: `$${capital} of capital and about $${gas} of gas`, time: '15 minutes to set up' },
    { text: secondAction ?? `Use one more feature of ${p.name} on ${chain} — a vote, a second pool or a second vault — once.`, cost: 'about $2 of gas', time: '10 minutes' },
  ];
  if (second !== null) {
    steps.push({
      text: `Repeat the same position on ${second}, the protocol's second chain, with half the capital, so the activity is not tied to one chain.`,
      cost: `$${Math.round(capital / 2)} of capital and about $4 of gas`,
      time: '15 minutes',
    });
  } else {
    steps.push({
      text: `Do one qualifying action a week on ${p.name} — a deposit, a borrow, a swap or a vote — so the account stays active.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    });
  }
  steps.push(
    { text: `Hold the position for at least ${hold} days, so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: `Before you withdraw anything, open the protocol's own points or rewards page and claim only from the link it publishes; never pay anyone to claim for you.`, cost: 'no fee to check', time: '10 minutes' },
    { text: `Write the wallet, the dates and every transaction hash in a farm log, then plan the exit: how you unwind, what slippage you accept and what the gas costs.`, cost: 'nothing but the log', time: '10 minutes' },
  );
  return steps;
}

/** The gas and hours a farmable plan costs, parsed from its own steps' cost/time text. */
function planEconomics(p: SnapshotProtocol, age: number | null): { gasUsd: number; capital: number; holdDays: number; hours: number } {
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 200 ? 10 : capital >= 100 ? 6 : 4;
  const gasUsd = 3 + gas + 2 + 4 + 2 * Math.ceil(hold / 7);
  const hours = 5 / 60 + 15 / 60 + 10 / 60 + 15 / 60 + (10 / 60) * Math.ceil(hold / 7) + 10 / 60 + 10 / 60;
  return { gasUsd, capital, holdDays: hold, hours };
}

// ---------------------------------------------------------------- the board

/** The protocols the board ranks: the farmable pre-token rows only (watchlist, early, off-list), each exactly once. */
export function buildBoard(snapshot: Snapshot): { board: BoardRow[]; fit: Fit; validation: Validation; comps: SnapshotProtocol[] } {
  const { fit, validation, comps } = fitModel(snapshot);
  const odds = tokenOddsMap(snapshot);
  const watch = new Set(snapshot.watchlist);
  const scored = snapshot.protocols.map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const bucket = bucketOf(p, watch);
    const imp = impliedFor(p, fit);
    const o = odds.get(p.slug) ?? 0;
    const steps = farmSteps(p, age, bucket);
    let verdict: Verdict = 'SKIP';
    let reason = '';
    let expectedGross = 0;
    let farmCost = 0;
    let hours = 0;
    let perHour = 0;
    if (isFarmable(bucket)) {
      const econ = planEconomics(p, age);
      expectedGross = o * imp.implied * ECONOMICS.farmer_pool_share * ECONOMICS.farmer_share;
      farmCost = econ.gasUsd + econ.capital * ECONOMICS.capital_apr * (econ.holdDays / 365);
      hours = econ.hours;
      perHour = (expectedGross - farmCost) / hours;
      if (perHour >= ECONOMICS.farm_threshold_usd_per_hour) {
        verdict = 'FARM';
        reason = `Expected $${expectedGross.toFixed(0)} gross against $${farmCost.toFixed(0)} of costs over ${hours.toFixed(1)} hours.`;
      } else if (perHour >= ECONOMICS.marginal_threshold_usd_per_hour) {
        verdict = 'MARGINAL';
        reason = `Expected $${expectedGross.toFixed(0)} gross against $${farmCost.toFixed(0)} of costs over ${hours.toFixed(1)} hours — worth it only if you farm it alongside other rows.`;
      } else {
        verdict = 'SKIP';
        reason = `Expected $${expectedGross.toFixed(0)} gross does not cover $${farmCost.toFixed(0)} of costs over ${hours.toFixed(1)} hours.`;
      }
    } else if (bucket === 'token-trades') {
      reason = 'Its token already trades: the market cap, not a launch, is the value here.';
    } else if (bucket === 'recorded') {
      reason = 'It already records a token identifier, so there is no launch left to farm.';
    } else {
      reason = `A ${bucket} row is not a launch: the ledger excludes it from farming.`;
    }
    return { p, age, bucket, imp, odds: o, steps, verdict, reason, expectedGross, farmCost, hours, perHour };
  });
  // The ranked board is the farmable pre-token rows only: watchlist, early
  // and off-list. Every other protocol is still scored above (its implied
  // value, odds and verdict feed the ledger and the validation) but it takes
  // no rank: a board topped by a traded-token exchange would read as a TVL
  // table, not a launch radar.
  const ranked = scored.filter((s) => isFarmable(s.bucket));
  ranked.sort((a, b) => b.imp.implied - a.imp.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board: BoardRow[] = ranked.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: tokenStatus(s.p),
    bucket: s.bucket,
    age_days: s.age,
    implied_value_usd: s.imp.implied,
    implied_p25_usd: s.imp.p25,
    implied_p75_usd: s.imp.p75,
    token_odds: round4(s.odds),
    verdict: s.verdict,
    verdict_reason: s.reason,
    dollars_per_hour: round4(s.perHour),
    expected_gross_usd: round4(s.expectedGross),
    farm_cost_usd: round4(s.farmCost),
    farm_hours: round4(s.hours),
    model: {
      log_tvl: round4(s.imp.logTvl),
      growth_pct: round4(s.imp.growthPct),
      intercept: round4(fit.intercept),
      tvl_term: round4(s.imp.tvlTerm),
      growth_term: round4(s.imp.growthTerm),
      category: s.p.category,
      category_offset: round4(s.imp.catOffset),
      log_pred: round4(s.imp.logPred),
      sigma: round4(fit.sigma),
      age_days: s.age,
    },
    farm_steps: s.steps.map(stepText),
  }));
  return { board, fit, validation, comps };
}

/** A board row's compact form for data.js, farm plan included. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    token_status: row.token_status,
    bucket: row.bucket,
    implied_value_usd: row.implied_value_usd,
    implied_p25_usd: row.implied_p25_usd,
    implied_p75_usd: row.implied_p75_usd,
    token_odds: row.token_odds,
    verdict: row.verdict,
    verdict_reason: row.verdict_reason,
    dollars_per_hour: row.dollars_per_hour,
    log_tvl: row.model.log_tvl,
    growth_pct: row.model.growth_pct,
    tvl_term: row.model.tvl_term,
    growth_term: row.model.growth_term,
    category_offset: row.model.category_offset,
    log_pred: row.model.log_pred,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const { board, fit, validation, comps } = buildBoard(snapshot);
  const ledger = {
    watchlist: 0,
    early: 0,
    'off-list': 0,
    'token-trades': 0,
    recorded: 0,
    bridge: 0,
    staking: 0,
    exchange: 0,
    versioned: 0,
  } as Record<Bucket, number>;
  // The ledger accounts for the whole snapshot, not just the ranked board:
  // every protocol lands in exactly one bucket, and the buckets sum to the
  // snapshot's 758 even though the board ranks only the 198 farmable rows.
  const watch = new Set(snapshot.watchlist);
  for (const p of snapshot.protocols) ledger[bucketOf(p, watch)] += 1;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    fit,
    validation,
    ledger,
    ledger_total: snapshot.protocols.length,
    watchlist_size: snapshot.watchlist.length,
    watchlist_covered: board.filter((r) => snapshot.watchlist.includes(r.slug)).length,
    board_size: board.length,
    farmable_size: board.length,
    worth_farming: board.filter((r) => r.verdict === 'FARM' || r.verdict === 'MARGINAL').length,
    rows: board.map(radarRow),
    comps: comps.map((p) => ({
      slug: p.slug,
      log_tvl: round4(Math.log10(p.tvl_usd)),
      log_mcap: round4(Math.log10(p.mcap_usd!)),
      category: p.category,
    })),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  // The board ranks the farmable pre-token protocols only, never the whole
  // snapshot: count the farmable buckets straight from the snapshot.
  const watch = new Set(snapshot.watchlist);
  const farmable = snapshot.protocols.filter((p) => isFarmable(bucketOf(p, watch))).length;
  if (board.length !== farmable) return `the board holds ${board.length} rows, the snapshot holds ${farmable} farmable protocols`;
  for (const r of board) {
    if (!isFarmable(r.bucket)) return `${r.slug} is a ${r.bucket} row, and the board ranks farmable rows only`;
  }
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.implied_value_usd > 100_000_000_000_000) return `${r.slug} has implied value over the gate cap`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
