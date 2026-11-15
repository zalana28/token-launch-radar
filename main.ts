// Token Launch Radar — the entrypoint (Node 22, standard library only).
//
// Reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>),
// scores every pre-token protocol with the radar-2 model in lib/model.ts,
// verifies every board number against the snapshot with an independent
// recomputation (verifyAgainstSnapshot below: the build writes nothing unless
// each row's TVL, growth, age, chains and implied value trace to the
// snapshot), writes the ranked board to /output/board.json, the dashboard's
// data to /output/data.js, copies this repository's dashboard/ and
// screenshots/ to /output, and writes /output/dossier.json with the vendored
// make.fun library. The dashboard is a static page, no framework and no
// network: dashboard/index.html, dashboard/app.css and dashboard/app.js read
// the data.js this program writes beside them.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import type { BoardRow, RadarData, Snapshot } from './lib/model.ts';
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

/**
 * Primary-source verification: every number on the board must trace to the
 * snapshot, never be invented. This re-derives each row from the raw snapshot
 * with the radar-2 formula restated here in literals, so it cross-checks the
 * model instead of re-running it: if the model and this check disagree, the
 * build stops and writes nothing. The snapshot wins every disagreement: its
 * value is expected, the board's is actual.
 */
function verifyAgainstSnapshot(board: BoardRow[], radar: RadarData, snapshot: Snapshot): void {
  const fail = (why: string): never => {
    throw new Error(`token radar: board does not match snapshot.json: ${why}`);
  };
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const versioned = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
  const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
  const ageFrom = (listedAt: string | null): number | null => {
    if (listedAt === null) return null;
    const a = Date.parse(`${snapshot.as_of}T00:00:00Z`);
    const b = Date.parse(`${listedAt}T00:00:00Z`);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.max(0, Math.floor((a - b) / 86_400_000));
  };

  // Every row: fields copied exactly from its snapshot protocol, implied value
  // recomputed from those fields, membership earned by the rule, not by hand.
  const seen = new Set<string>();
  board.forEach((row, i) => {
    const p = index.get(row.slug);
    if (p === undefined) fail(`${row.slug} is not in snapshot.json`);
    if (seen.has(row.slug)) fail(`${row.slug} appears twice on the board`);
    seen.add(row.slug);
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
    const preToken = p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
    if (!preToken) fail(`${row.slug} has a token in the snapshot and must not be ranked`);
    if (row.token_status !== 'pre-token') fail(`${row.slug} token_status is ${row.token_status}`);
    const age = ageFrom(p.listed_at);
    if (row.age_days !== age) fail(`${row.slug} age ${row.age_days} days != snapshot ${age} days`);
    // Independent recomputation of the radar-2 formula, literals restated.
    const growthPct = Math.min(150, Math.max(-40, p.change_7d ?? 0));
    const growthMult = 1 + (growthPct / 100) * 0.6;
    const ageForModel = age ?? 270;
    const maturityMult = 0.5 + (Math.min(Math.max(ageForModel, 0), 730) / 730) * 0.5;
    const breadthMult = p.chains.length <= 1 ? 1 : Math.min(1.3, 1 + 0.1 * Math.log(p.chains.length));
    const implied = Math.max(1, Math.round(p.tvl_usd * 0.3 * growthMult * maturityMult * breadthMult));
    if (row.implied_value_usd !== implied)
      fail(`${row.slug} implied $${row.implied_value_usd} != recomputed $${implied} from snapshot TVL/growth/age/chains`);
    if (row.model.base_multiple !== 0.3) fail(`${row.slug} base_multiple is ${row.model.base_multiple}`);
    if (row.model.growth_pct !== growthPct) fail(`${row.slug} growth_pct ${row.model.growth_pct} != ${growthPct}`);
    if (row.model.growth_multiplier !== round4(growthMult)) fail(`${row.slug} growth_multiplier differs from recomputation`);
    if (row.model.maturity_multiplier !== round4(maturityMult)) fail(`${row.slug} maturity_multiplier differs from recomputation`);
    if (row.model.breadth_multiplier !== round4(breadthMult)) fail(`${row.slug} breadth_multiplier differs from recomputation`);
    if (row.model.age_days !== age) fail(`${row.slug} model age_days differs from the snapshot`);
    if (i > 0 && row.implied_value_usd > board[i - 1]!.implied_value_usd)
      fail(`${row.slug} outranks the row above it on implied value`);
    const onWatchlist = snapshot.watchlist.includes(row.slug);
    const rankable = preToken && p.category !== 'CEX' && !versioned.test(p.name);
    if (!onWatchlist && !(rankable && p.tvl_usd < snapshot.floor_usd)) {
      fail(`${row.slug} is neither on the watchlist nor a rankable protocol below the $${snapshot.floor_usd} floor`);
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) fail(`${row.slug} has ${row.farm_steps.length} farm steps`);
    for (const s of row.farm_steps)
      if (s.length < 20 || s.length > 600) fail(`${row.slug} has a farm step of ${s.length} characters`);
  });
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) fail(`watchlist slug ${slug} is missing from the board`);
  }

  // The live set: the top 30 live-token protocols by market cap, fields copied exactly.
  const liveExpected = snapshot.protocols
    .filter((p) => !(p.mcap_usd === null && p.gecko_id === null && p.symbol === null) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 30);
  if (radar.live.length !== liveExpected.length)
    fail(`live set has ${radar.live.length} rows, the snapshot's top live set has ${liveExpected.length}`);
  radar.live.forEach((row, i) => {
    const p = liveExpected[i]!;
    if (row.slug !== p.slug) fail(`live row ${i + 1} is ${row.slug}, the snapshot's is ${p.slug}`);
    if (row.tvl_usd !== p.tvl_usd || row.mcap_usd !== p.mcap_usd || row.change_7d !== p.change_7d)
      fail(`live row ${row.slug} market values differ from the snapshot`);
    if (row.name !== p.name || row.category !== p.category || JSON.stringify(row.chains) !== JSON.stringify(p.chains))
      fail(`live row ${row.slug} fields differ from the snapshot`);
  });

  // The dashboard's data must be the same verified board, same order, same values.
  if (radar.board_size !== board.length) fail(`radar board_size ${radar.board_size} != ${board.length}`);
  if (radar.watchlist_size !== snapshot.watchlist.length) fail(`radar watchlist_size differs from the snapshot`);
  if (radar.early_size !== board.filter((r) => !snapshot.watchlist.includes(r.slug)).length)
    fail(`radar early_size differs from the board`);
  if (radar.live_size !== radar.live.length) fail(`radar live_size differs from the live set`);
  if (radar.as_of !== snapshot.as_of || radar.source !== snapshot.source || radar.floor_usd !== snapshot.floor_usd)
    fail(`radar header (as_of/source/floor) differs from the snapshot`);
  if (radar.rows.length !== board.length) fail(`data.js carries ${radar.rows.length} rows, the board has ${board.length}`);
  radar.rows.forEach((row, i) => {
    if (row.slug !== board[i]!.slug) fail(`data.js row ${i + 1} is ${row.slug}, the board's is ${board[i]!.slug}`);
    if (row.implied_value_usd !== board[i]!.implied_value_usd)
      fail(`data.js ${row.slug} implied $${row.implied_value_usd} != board $${board[i]!.implied_value_usd}`);
    if (
      row.growth_multiplier !== board[i]!.model.growth_multiplier ||
      row.maturity_multiplier !== board[i]!.model.maturity_multiplier ||
      row.breadth_multiplier !== board[i]!.model.breadth_multiplier
    ) {
      fail(`data.js ${row.slug} multipliers differ from the board`);
    }
  });
}

verifyAgainstSnapshot(board, radar, snapshot);
process.stdout.write(
  `token radar: verified ${board.length} rows against snapshot.json (as_of ${snapshot.as_of}): every TVL, 7d growth, age, chain list and implied value traces to the snapshot\n`,
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
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
