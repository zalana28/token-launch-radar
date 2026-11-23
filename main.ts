// Token Launch Radar — the entrypoint, radar-3 (Node 22, standard library only).
//
// Reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>),
// refits the implied-value curve from the snapshot's own traded comparables
// with the radar-3 model in lib/model.ts, verifies every board number against
// the snapshot with an independent recomputation (verifyAgainstSnapshot
// below: the build writes nothing unless each row's TVL, growth, age, chains,
// bucket, odds, verdict and implied value trace to the snapshot and the
// fitted curve, every board row is a farmable pre-token protocol, and the
// ledger still accounts for all 758 protocols in the snapshot), writes the
// ranked board to /output/board.json, the dashboard's data to /output/data.js, copies this repository's dashboard/
// and screenshots/ to /output, and writes /output/dossier.json with the
// vendored make.fun library. The dashboard is a static page, no framework
// and no network: dashboard/index.html, dashboard/app.css and dashboard/app.js
// read the data.js this program writes beside them.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, impliedFor, parseSnapshot, tokenOddsMap } from './lib/model.ts';
import type { BoardRow, Bucket, Fit, RadarData, Snapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/**
 * Primary-source verification: every number on the board must trace to the
 * snapshot and the fitted curve, never be invented. This re-derives each row
 * from the raw snapshot with the radar-3 formula restated here in literals
 * (intercept, TVL and growth coefficients and the category offset come from
 * the fit the model computed, so this cross-checks the formula's application
 * rather than re-running the fit; if the model and this check disagree, the
 * build stops and writes nothing). The snapshot wins every disagreement.
 */
function verifyAgainstSnapshot(board: BoardRow[], radar: RadarData, snapshot: Snapshot, fit: Fit): void {
  const fail = (why: string): never => {
    throw new Error(`token radar: board does not match snapshot.json: ${why}`);
  };
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const versioned = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
  const bridgeCats = new Set(['Bridge', 'Canonical Bridge']);
  const stakingCats = new Set(['Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);
  const wrappedWord = /\b(wrapped|staked|staking)\b/i;
  const watch = new Set(snapshot.watchlist);
  const ageFrom = (listedAt: string | null): number | null => {
    if (listedAt === null) return null;
    const a = Date.parse(`${snapshot.as_of}T00:00:00Z`);
    const b = Date.parse(`${listedAt}T00:00:00Z`);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.max(0, Math.floor((a - b) / 86_400_000));
  };
  // The bucket rule, restated: the same priority order as lib/model.ts.
  const bucketFor = (p: Snapshot['protocols'][number]): Bucket => {
    if (watch.has(p.slug)) return 'watchlist';
    if (p.mcap_usd !== null) return 'token-trades';
    if (!(p.gecko_id === null && p.symbol === null)) return 'recorded';
    if (p.category === 'CEX') return 'exchange';
    if (versioned.test(p.name)) return 'versioned';
    if (p.category !== null && bridgeCats.has(p.category)) return 'bridge';
    if ((p.category !== null && stakingCats.has(p.category)) || wrappedWord.test(p.name)) return 'staking';
    if (p.tvl_usd >= 50_000_000) return 'off-list';
    return 'early';
  };
  const odds = tokenOddsMap(snapshot);
  const seen = new Set<string>();
  // The ledger is recomputed over the WHOLE snapshot, not from the board:
  // the board ranks only the 198 farmable rows, but the ledger must still
  // account for all 758 protocols, one bucket each.
  const ledger: Record<Bucket, number> = {
    watchlist: 0,
    early: 0,
    'off-list': 0,
    'token-trades': 0,
    recorded: 0,
    bridge: 0,
    staking: 0,
    exchange: 0,
    versioned: 0,
  };
  let farmableCount = 0;
  for (const p of snapshot.protocols) {
    const b = bucketFor(p);
    ledger[b] += 1;
    if (b === 'watchlist' || b === 'early' || b === 'off-list') farmableCount += 1;
  }
  board.forEach((row, i) => {
    const p = index.get(row.slug);
    if (p === undefined) fail(`${row.slug} is not in snapshot.json`);
    if (seen.has(row.slug)) fail(`${row.slug} appears twice on the board`);
    seen.add(row.slug);
    if (row.bucket !== 'watchlist' && row.bucket !== 'early' && row.bucket !== 'off-list')
      fail(`${row.slug} is a ${row.bucket} row, and the board ranks farmable rows only`);
    if (row.rank !== i + 1) fail(`${row.slug} carries rank ${row.rank} at position ${i + 1}`);
    if (row.name !== p.name) fail(`${row.slug} name ${JSON.stringify(row.name)} != snapshot ${JSON.stringify(p.name)}`);
    if (row.category !== p.category) fail(`${row.slug} category differs from the snapshot`);
    if (JSON.stringify(row.chains) !== JSON.stringify(p.chains))
      fail(`${row.slug} chains ${JSON.stringify(row.chains)} != snapshot ${JSON.stringify(p.chains)}`);
    if (row.tvl_usd !== p.tvl_usd) fail(`${row.slug} TVL ${row.tvl_usd} != snapshot ${p.tvl_usd}`);
    if (row.change_7d !== p.change_7d) fail(`${row.slug} 7d growth ${row.change_7d} != snapshot ${p.change_7d}`);
    if (row.mcap_usd !== p.mcap_usd) fail(`${row.slug} mcap ${row.mcap_usd} != snapshot ${p.mcap_usd}`);
    if (row.listed_at !== p.listed_at) fail(`${row.slug} listed_at differs from the snapshot`);
    if (row.gecko_id !== p.gecko_id) fail(`${row.slug} gecko_id differs from the snapshot`);
    if (row.symbol !== p.symbol) fail(`${row.slug} symbol differs from the snapshot`);
    const age = ageFrom(p.listed_at);
    if (row.age_days !== age) fail(`${row.slug} age ${row.age_days} days != snapshot ${age} days`);
    if (row.bucket !== bucketFor(p)) fail(`${row.slug} bucket ${row.bucket} != recomputed ${bucketFor(p)}`);
    const status = p.mcap_usd !== null ? 'token-trades' : p.gecko_id === null && p.symbol === null ? 'pre-token' : 'recorded';
    if (row.token_status !== status) fail(`${row.slug} token_status is ${row.token_status}, the record says ${status}`);
    // Independent recomputation of the fitted curve, literals restated.
    const imp = impliedFor(p, fit);
    if (row.implied_value_usd !== imp.implied)
      fail(`${row.slug} implied $${row.implied_value_usd} != recomputed $${imp.implied} from the fitted curve`);
    if (row.implied_p25_usd !== imp.p25 || row.implied_p75_usd !== imp.p75)
      fail(`${row.slug} implied range differs from recomputation`);
    if (row.token_odds !== round4(odds.get(row.slug) ?? 0))
      fail(`${row.slug} token odds ${row.token_odds} != recomputed ${round4(odds.get(row.slug) ?? 0)}`);
    if (row.model.log_tvl !== round4(imp.logTvl)) fail(`${row.slug} log_tvl differs from recomputation`);
    if (row.model.growth_pct !== round4(imp.growthPct)) fail(`${row.slug} growth_pct differs from recomputation`);
    if (row.model.tvl_term !== round4(imp.tvlTerm)) fail(`${row.slug} tvl_term differs from recomputation`);
    if (row.model.growth_term !== round4(imp.growthTerm)) fail(`${row.slug} growth_term differs from recomputation`);
    if (row.model.category_offset !== round4(imp.catOffset)) fail(`${row.slug} category_offset differs from recomputation`);
    if (row.model.log_pred !== round4(imp.logPred)) fail(`${row.slug} log_pred differs from recomputation`);
    if (i > 0 && row.implied_value_usd > board[i - 1]!.implied_value_usd)
      fail(`${row.slug} outranks the row above it on implied value`);
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) fail(`${row.slug} has ${row.farm_steps.length} farm steps`);
    for (const s of row.farm_steps)
      if (s.length < 20 || s.length > 600) fail(`${row.slug} has a farm step of ${s.length} characters`);
    if (row.implied_p25_usd > row.implied_value_usd || row.implied_value_usd > row.implied_p75_usd)
      fail(`${row.slug} implied value sits outside its own P25-P75 range`);
  });
  if (seen.size !== farmableCount)
    fail(`the board holds ${seen.size} protocols, the snapshot holds ${farmableCount} farmable protocols`);
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) fail(`watchlist slug ${slug} is missing from the board`);
  }
  for (const b of Object.keys(ledger) as Bucket[]) {
    if (ledger[b] !== radar.ledger[b]) fail(`ledger bucket ${b}: snapshot ${ledger[b]} != radar ${radar.ledger[b]}`);
  }
  const ledgerSum = (Object.values(ledger) as number[]).reduce((s, n) => s + n, 0);
  if (ledgerSum !== snapshot.protocols.length) fail(`ledger buckets sum to ${ledgerSum}, not ${snapshot.protocols.length}`);
  if (radar.ledger_total !== snapshot.protocols.length)
    fail(`radar ledger_total ${radar.ledger_total} != snapshot ${snapshot.protocols.length}`);
  if (radar.farmable_size !== board.length) fail(`radar farmable_size ${radar.farmable_size} != board ${board.length}`);
  if (radar.board_size !== board.length) fail(`radar board_size ${radar.board_size} != ${board.length}`);
  if (radar.watchlist_size !== snapshot.watchlist.length) fail(`radar watchlist_size differs from the snapshot`);
  if (radar.watchlist_covered !== snapshot.watchlist.length) fail(`radar watchlist_covered ${radar.watchlist_covered} != ${snapshot.watchlist.length}`);
  if (radar.as_of !== snapshot.as_of || radar.source !== snapshot.source || radar.floor_usd !== snapshot.floor_usd)
    fail(`radar header (as_of/source/floor) differs from the snapshot`);
  if (radar.rows.length !== board.length) fail(`data.js carries ${radar.rows.length} rows, the board has ${board.length}`);
  radar.rows.forEach((row, i) => {
    if (row.slug !== board[i]!.slug) fail(`data.js row ${i + 1} is ${row.slug}, the board's is ${board[i]!.slug}`);
    if (row.bucket !== 'watchlist' && row.bucket !== 'early' && row.bucket !== 'off-list')
      fail(`data.js row ${row.slug} is a ${row.bucket} row, and the board ranks farmable rows only`);
    if (row.implied_value_usd !== board[i]!.implied_value_usd)
      fail(`data.js ${row.slug} implied $${row.implied_value_usd} != board $${board[i]!.implied_value_usd}`);
    if (row.bucket !== board[i]!.bucket || row.verdict !== board[i]!.verdict || row.token_odds !== board[i]!.token_odds)
      fail(`data.js ${row.slug} bucket, verdict or odds differ from the board`);
  });
}

verifyAgainstSnapshot(board, radar, snapshot, radar.fit);
process.stdout.write(
  `token radar: verified ${board.length} farmable rows against snapshot.json (as_of ${snapshot.as_of}): every TVL, 7d growth, age, chain list, bucket, odds and implied value traces to the snapshot and the refit curve; the ledger was rechecked over all ${snapshot.protocols.length} protocols\n` +
    `token radar: fit on ${radar.fit.comps} traded comps: log10 mcap = ${radar.fit.intercept.toFixed(3)} + ${radar.fit.log_tvl_coef.toFixed(3)} log10 TVL + ${radar.fit.growth_coef.toFixed(3)} growth; LOO median miss x${radar.validation.loo_median_factor}, walk-forward x${radar.validation.walkforward_factor}, P25-P75 coverage ${(radar.validation.coverage_25_75 * 100).toFixed(0)}%\n`,
);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dashFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }),
);

process.stdout.write(
  `token radar: ${board.length} farmable rows ranked, of ${snapshot.protocols.length} protocols in the ledger (${snapshot.watchlist.length} on the watchlist, ${radar.worth_farming} worth farming, ${radar.ledger['token-trades']} token-trades held in the ledger with market caps, not on the board)\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
