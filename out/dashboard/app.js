// Token Radar's dashboard, radar-3. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a filterable table, a
// per-protocol detail view with the model's own breakdown and the farm plan,
// the model-evidence panels, and the ledger of all 758 protocols. No network:
// every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', bucket: 'farmable', verdict: 'all', sort: 'implied', dir: -1, selected: null, tab: 'board' };

  var BUCKETS = ['watchlist', 'early', 'off-list', 'token-trades', 'recorded', 'bridge', 'staking', 'exchange', 'versioned'];
  var BUCKET_LABEL = {
    'watchlist': 'Watchlist', 'early': 'Early', 'off-list': 'Off-list', 'token-trades': 'Token trades',
    'recorded': 'Recorded', 'bridge': 'Bridge', 'staking': 'Staking', 'exchange': 'Exchange', 'versioned': 'Versioned'
  };
  var BUCKET_WHY = {
    'watchlist': 'At or above the $50M floor, records no token, and not a wrapped, staked or bridged product.',
    'early': 'Records no token and sits below the floor — the early rows the radar exists to find.',
    'off-list': 'Records no token and sits above the floor, but the watchlist rule left it out.',
    'token-trades': 'Its token already trades: the market cap is the value, not the model.',
    'recorded': 'Records a token identifier (a symbol or a CoinGecko id) but no market cap.',
    'bridge': 'A bridge moves other protocols\u2019 assets, so it is not a launch of its own.',
    'staking': 'A staked, wrapped or liquid-staking product of a token that already exists.',
    'exchange': 'A centralised exchange: a venue, not a protocol launch.',
    'versioned': 'A versioned release (V2, 2.0 and the like) of a protocol that already exists.'
  };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtX(n) { return 'x' + Number(n).toFixed(2); }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('bucket')) state.bucket = params.get('bucket');
    if (params.get('verdict')) state.verdict = params.get('verdict');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.bucket !== 'farmable') params.set('bucket', state.bucket);
    if (state.verdict !== 'all') params.set('verdict', state.verdict);
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // The fitted curve, restated on the page: the dashboard recomputes a row
  // from the snapshot figures and checks the number board.json carries.
  function impliedOf(row) {
    var f = DATA.fit;
    var growth = Math.min(f.growth_cap, Math.max(f.growth_floor, row.change_7d === null ? 0 : row.change_7d));
    var logPred = f.intercept + f.log_tvl_coef * Math.log10(row.tvl_usd) + f.growth_coef * (growth / 100) + (f.category_offsets[row.category || '(none)'] || 0);
    return Math.max(1, Math.round(Math.pow(10, logPred)));
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.bucket === 'pre-token') {
        if (r.token_status !== 'pre-token') return false;
      } else if (state.bucket === 'farmable') {
        if (!(r.bucket === 'watchlist' || r.bucket === 'early' || r.bucket === 'off-list')) return false;
      } else if (state.bucket !== 'all' && r.bucket !== state.bucket) return false;
      if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'odds') { av = a.token_odds; bv = b.token_odds; }
      else if (key === 'perhour') { av = a.dollars_per_hour; bv = b.dollars_per_hour; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    var v = DATA.validation;
    return el('div', null,
      el('p', { class: 'meta', text: 'Snapshot ' + DATA.as_of + '  ·  Model ' + DATA.model_version + '  ·  Refit at runtime from ' + DATA.fit.comps + ' traded comparables' }),
      el('h1', { text: 'Token Launch Radar' }),
      el('p', { class: 'lede', text: 'The snapshot\u2019s 198 farmable pre-token protocols, ranked by the implied value a token would carry if the protocol\u2019s record stayed as it is: 40 watchlist rows, 138 early rows below the floor, and 20 off-list rows the watchlist left out. The other 560 protocols are not ranked — a token that already trades, a recorded identifier, a bridge, a wrapper or a versioned release is no launch to farm — but all 758 are accounted for in the ledger. Implied value is this radar\u2019s own fitted claim — never a prediction that a token will be issued, and never a price.' }),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('b', { text: fmtX(v.walkforward_factor) }), el('span', { text: 'walk-forward miss (median, ' + v.walkforward_train + ' fit / ' + v.walkforward_test + ' tested)' })),
        el('div', { class: 'stat' }, el('b', { text: Math.round(v.coverage_25_75 * 100) + '%' }), el('span', { text: 'range honesty: market caps inside the P25\u2013P75 band (target 50%)' })),
        el('div', { class: 'stat' }, el('b', { text: v.brier.toFixed(3) }), el('span', { text: 'odds calibration (Brier; climatology ' + v.brier_climatology.toFixed(3) + ', lower is better)' })),
        el('div', { class: 'stat' }, el('b', { text: '3 terms' }), el('span', { text: 'kept: log10 TVL, 7d growth, category ridge' })),
        el('div', { class: 'stat' }, el('b', { text: String(DATA.worth_farming) }), el('span', { text: 'worth farming (FARM or MARGINAL, net of fees)' })),
        el('div', { class: 'stat' }, el('b', { text: DATA.watchlist_covered + ' / ' + DATA.watchlist_size }), el('span', { text: 'watchlist coverage' }))
      )
    );
  }

  // The scatter is built as markup, so no namespace string is ever needed.
  function scatter() {
    var W = 560, H = 300, pad = 34;
    var pts = DATA.comps;
    var xs = pts.map(function (p) { return p.log_tvl; });
    var ys = pts.map(function (p) { return p.log_mcap; });
    var x0 = Math.min.apply(null, xs) - 0.2, x1 = Math.max.apply(null, xs) + 0.2;
    var y0 = Math.min.apply(null, ys) - 0.3, y1 = Math.max.apply(null, ys) + 0.3;
    function X(v) { return (pad + ((v - x0) / (x1 - x0)) * (W - 2 * pad)).toFixed(1); }
    function Y(v) { return (H - pad - ((v - y0) / (y1 - y0)) * (H - 2 * pad)).toFixed(1); }
    var f = DATA.fit;
    var ly0 = f.intercept + f.log_tvl_coef * x0, ly1 = f.intercept + f.log_tvl_coef * x1;
    var s = '<svg class="scatter" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Market cap against TVL for the traded comparables, with the fitted line">';
    s += '<line x1="' + X(x0) + '" y1="' + Y(y0) + '" x2="' + X(x1) + '" y2="' + Y(y0) + '" stroke="#dfe6ee"/>';
    s += '<line x1="' + X(x0) + '" y1="' + Y(y0) + '" x2="' + X(x0) + '" y2="' + Y(y1) + '" stroke="#dfe6ee"/>';
    s += '<line x1="' + X(x0) + '" y1="' + Y(ly0) + '" x2="' + X(x1) + '" y2="' + Y(ly1) + '" stroke="#0b6fa4" stroke-width="2"/>';
    pts.forEach(function (p) {
      s += '<circle cx="' + X(p.log_tvl) + '" cy="' + Y(p.log_mcap) + '" r="3.2" fill="#0b6fa4" opacity="0.55"/>';
    });
    s += '<text x="' + X(x0) + '" y="' + (H - 10) + '" fill="#5b6b7c" font-size="11" text-anchor="middle">TVL (log10 $)</text>';
    s += '<text x="12" y="' + (Number(Y(y1)) + 4) + '" fill="#5b6b7c" font-size="11">Market cap (log10 $)</text>';
    s += '<text x="' + X(x1) + '" y="' + (Number(Y(y0)) - 8) + '" fill="#5b6b7c" font-size="11" text-anchor="end">fitted line: growth 0, no category offset</text>';
    s += '</svg>';
    var div = document.createElement('div');
    div.innerHTML = s;
    return div.firstChild;
  }

  function evidence() {
    var f = DATA.fit, v = DATA.validation;
    var abl = el('tbody');
    v.ablation.forEach(function (a) {
      abl.appendChild(el('tr', null,
        el('td', { text: a.variant }),
        el('td', { class: 'num', text: a.loo_median_dex.toFixed(2) + ' dex' }),
        el('td', { class: 'num', text: fmtX(a.loo_median_factor) })
      ));
    });
    return el('div', { class: 'evidence' },
      el('section', { class: 'card' },
        el('h2', { text: 'The model, refit from the snapshot' }),
        el('div', { class: 'equation', text: 'log10 implied = ' + f.intercept.toFixed(3) + ' + ' + f.log_tvl_coef.toFixed(3) + ' \u00d7 log10 TVL + ' + f.growth_coef.toFixed(3) + ' \u00d7 growth + category offset' }),
        el('p', null, el('b', { text: 'Fit on ' + f.comps + ' traded comparables' }), document.createTextNode(' (positive market cap and TVL, not an exchange). Growth is the 7-day change clamped to \u221240% \u2026 +150%. Category offsets are shrunk mean residuals (k = ' + f.category_shrinkage_k + '), so a thin category pulls toward zero instead of toward noise.')),
        el('p', null, el('b', { text: 'Leave-one-out median miss ' + fmtX(v.loo_median_factor) + ' (' + v.loo_median_dex.toFixed(2) + ' dex)' }), document.createTextNode(' — refit without each comparable in turn. The walk-forward miss is ' + fmtX(v.walkforward_factor) + ': fit on the earliest-listed ' + v.walkforward_train + ' comparables, tested on the ' + v.walkforward_test + ' listed later.')),
        el('p', null, el('b', { text: 'Range honesty: ' + Math.round(v.coverage_25_75 * 100) + '% in P25\u2013P75, ' + Math.round(v.coverage_10_90 * 100) + '% in P10\u2013P90.' }), document.createTextNode(' The bands are honest about the noise: TVL alone explains only part of a market cap, and the board says so instead of hiding it.'))
      ),
      el('section', { class: 'card' },
        el('h2', { text: 'Ablation — what each term earns' }),
        el('table', null,
          el('thead', null, el('tr', null, el('th', { text: 'Variant' }), el('th', { class: 'num', text: 'LOO error' }), el('th', { class: 'num', text: 'Miss' }))),
          abl
        ),
        el('p', { class: 'note', text: 'Leave-one-out error, same procedure for every row. TVL does the work; growth and the category ridge are kept because they are the terms the brief names, not because they flatter the fit.' }),
        scatter(),
        el('p', { class: 'note', text: 'Each dot is a traded comparable (market cap against TVL, log scales). The line is the fitted curve at zero growth and no category offset.' })
      )
    );
  }

  function controls() {
    var search = el('input', { type: 'search', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    function opt(value, label, current) {
      return el('option', { value: value, text: label, selected: value === current ? 'selected' : null });
    }
    var bucketSel = el('select', { 'aria-label': 'Filter by bucket' },
      opt('farmable', 'Farmable (watchlist + early + off-list)', state.bucket),
      opt('pre-token', 'Pre-token only', state.bucket),
      opt('all', 'All 198 ranked rows', state.bucket),
      BUCKETS.map(function (b) { return opt(b, BUCKET_LABEL[b] + ' (' + DATA.ledger[b] + ')', state.bucket); })
    );
    bucketSel.addEventListener('change', function () { state.bucket = bucketSel.value; writeHash(); render(); });
    var verdictSel = el('select', { 'aria-label': 'Filter by verdict' },
      opt('all', 'Any verdict', state.verdict),
      opt('FARM', 'FARM', state.verdict),
      opt('MARGINAL', 'MARGINAL', state.verdict),
      opt('SKIP', 'SKIP', state.verdict)
    );
    verdictSel.addEventListener('change', function () { state.verdict = verdictSel.value; writeHash(); render(); });
    var sortSel = el('select', { 'aria-label': 'Sort the board' },
      opt('implied', 'Sort: implied value', state.sort),
      opt('tvl', 'Sort: TVL', state.sort),
      opt('odds', 'Sort: token odds', state.sort),
      opt('perhour', 'Sort: $/hr', state.sort),
      opt('name', 'Sort: name', state.sort)
    );
    sortSel.addEventListener('change', function () { state.sort = sortSel.value; writeHash(); render(); });
    var boardTab = el('button', { type: 'button', 'aria-pressed': state.tab === 'board' ? 'true' : 'false', text: 'Board', onclick: function () { state.tab = 'board'; writeHash(); render(); } });
    var ledgerTab = el('button', { type: 'button', 'aria-pressed': state.tab === 'ledger' ? 'true' : 'false', text: 'Ledger (758)', onclick: function () { state.tab = 'ledger'; writeHash(); render(); } });
    return el('div', null,
      el('div', { class: 'controls' }, search, bucketSel, verdictSel, sortSel, el('div', { class: 'tabs' }, boardTab, ledgerTab)),
      el('p', { class: 'count', text: filteredRows().length + ' of ' + DATA.board_size + ' rows shown \u00b7 click a row for its model breakdown, odds, range and farm plan' })
    );
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'card' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another bucket to see the board again.' }),
        el('button', { type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.bucket = 'pre-token'; state.verdict = 'all'; writeHash(); render(); } })
      );
    }
    var tbody = el('tbody');
    list.forEach(function (r) {
      var tr = el('tr', {
        class: state.selected === r.slug ? 'sel' : '',
        tabindex: '0',
        onclick: function () { selectRow(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectRow(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('b', { text: r.name }), el('br'), el('span', { text: (r.category || 'No category') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') : 'one chain') })),
        el('td', null, el('span', { class: 'tag ' + r.bucket, text: BUCKET_LABEL[r.bucket] })),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.implied_p25_usd) + ' \u2013 ' + fmtUsd(r.implied_p75_usd) }),
        el('td', { class: 'num', text: Math.round(r.token_odds * 100) + '%' }),
        el('td', null, el('span', { class: 'verdict ' + r.verdict, text: r.verdict })),
        el('td', { class: 'num', text: '$' + r.dollars_per_hour.toFixed(2) })
      );
      if (r.token_status === 'token-trades') {
        tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }));
      } else {
        tr.appendChild(el('td', { class: 'num', text: '\u2014' }));
      }
      tbody.appendChild(tr);
    });
    return el('div', { class: 'card' },
      el('table', null,
        el('thead', null, el('tr', null,
          el('th', { class: 'num', text: 'Rank' }), el('th', { text: 'Protocol' }), el('th', { text: 'Bucket' }),
          el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: '7d' }),
          el('th', { class: 'num', text: 'Implied' }), el('th', { class: 'num', text: 'P25\u2013P75' }),
          el('th', { class: 'num', text: 'Odds' }), el('th', { text: 'Verdict' }), el('th', { class: 'num', text: '$/hr' }),
          el('th', { class: 'num', text: 'Mcap' })
        )),
        tbody
      )
    );
  }

  function ledgerView() {
    var tbody = el('tbody');
    BUCKETS.forEach(function (b) {
      tbody.appendChild(el('tr', { onclick: function () { state.bucket = b; state.tab = 'board'; writeHash(); render(); } },
        el('td', null, el('span', { class: 'tag ' + b, text: BUCKET_LABEL[b] })),
        el('td', { class: 'num', text: String(DATA.ledger[b]) }),
        el('td', { text: BUCKET_WHY[b] })
      ));
    });
    return el('div', { class: 'card' },
      el('h2', { text: 'The ledger — every protocol, one bucket each' }),
      el('p', { text: 'The buckets are mutually exclusive and sum to ' + DATA.ledger_total + ' — the whole snapshot, nothing left out and nothing counted twice. Click a bucket to filter the board to it.' }),
      el('table', null,
        el('thead', null, el('tr', null, el('th', { text: 'Bucket' }), el('th', { class: 'num', text: 'Protocols' }), el('th', { text: 'Why it is there' }))),
        tbody
      ),
      el('p', { class: 'note', text: 'A protocol is called pre-token because its record carries no token identifier — never as proof that it has none. The watchlist is the house\u2019s floor; the early and off-list buckets are the radar\u2019s own reading of the rest.' })
    );
  }

  function detailView() {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === state.selected) row = r; });
    if (!row) return null;
    var recomputed = impliedOf(row);
    var match = recomputed === row.implied_value_usd;
    var kv = el('div', { class: 'kv' },
      el('div', null, el('b', { text: fmtUsd(row.implied_value_usd) }), el('span', { text: 'implied value (fitted)' })),
      el('div', null, el('b', { text: fmtUsd(row.implied_p25_usd) + ' \u2013 ' + fmtUsd(row.implied_p75_usd) }), el('span', { text: 'P25\u2013P75 range' })),
      el('div', null, el('b', { text: Math.round(row.token_odds * 100) + '%' }), el('span', { text: 'token odds (peer base rate)' })),
      el('div', null, el('b', { text: row.verdict + ' \u00b7 $' + row.dollars_per_hour.toFixed(2) + '/hr' }), el('span', { text: 'net-of-fees verdict' }))
    );
    var breakdown = el('table', null,
      el('thead', null, el('tr', null, el('th', { text: 'Model term' }), el('th', { class: 'num', text: 'Value' }))),
      el('tbody', null,
        el('tr', null, el('td', { text: 'Intercept' }), el('td', { class: 'num', text: DATA.fit.intercept.toFixed(3) })),
        el('tr', null, el('td', { text: 'log10 TVL (' + row.log_tvl.toFixed(2) + ') \u00d7 ' + DATA.fit.log_tvl_coef.toFixed(3) }), el('td', { class: 'num', text: row.tvl_term.toFixed(3) })),
        el('tr', null, el('td', { text: '7d growth (' + row.growth_pct.toFixed(2) + '%) \u00d7 ' + DATA.fit.growth_coef.toFixed(3) }), el('td', { class: 'num', text: row.growth_term.toFixed(3) })),
        el('tr', null, el('td', { text: 'Category offset (' + (row.category || 'no category') + ')' }), el('td', { class: 'num', text: (row.category_offset >= 0 ? '+' : '') + row.category_offset.toFixed(3) })),
        el('tr', null, el('td', { text: 'log10 predicted market cap' }), el('td', { class: 'num', text: row.log_pred.toFixed(3) })),
        el('tr', null, el('td', { text: 'Residual sd (sigma)' }), el('td', { class: 'num', text: DATA.fit.sigma.toFixed(3) + ' dex' }))
      )
    );
    var mcapLine = row.token_status === 'token-trades'
      ? el('p', null, el('b', { text: 'Market cap: ' + fmtUsd(row.mcap_usd) + '. ' }), document.createTextNode('The market\u2019s own value sits ' + (row.mcap_usd >= row.implied_value_usd ? (row.mcap_usd / row.implied_value_usd).toFixed(1) + 'x above' : (row.implied_value_usd / row.mcap_usd).toFixed(1) + 'x below') + ' the fitted value — that gap is the model\u2019s error on a protocol it was fit from, shown, not hidden.'))
      : el('p', null, el('b', { text: 'Records no token. ' }), document.createTextNode('Age with no token: ' + fmtAge(row.age_days) + '. The odds are a peer base rate, not a prediction that a token will launch.'));
    var plan = el('ol', { class: 'plan' });
    row.farm_steps.forEach(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      plan.appendChild(el('li', null, el('b', { text: action }), el('br'), el('span', { text: tail })));
    });
    return el('section', { class: 'card detail', id: 'detail' },
      el('h2', { text: '#' + row.rank + ' \u00b7 ' + row.name }),
      el('p', { class: 'meta', text: (row.category || 'No category') + ' \u00b7 ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'one chain') + ' \u00b7 TVL ' + fmtUsd(row.tvl_usd) + ' \u00b7 7d ' + fmtPct(row.change_7d) + ' \u00b7 Age ' + fmtAge(row.age_days) }),
      kv,
      el('p', { text: row.verdict_reason }),
      mcapLine,
      el('h3', { text: 'Model breakdown' }),
      breakdown,
      el('p', { class: 'note', text: 'The page recomputes this row as ' + fmtUsd(recomputed) + (match ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') }),
      el('h3', { text: 'Farm plan \u2014 ' + row.farm_steps.length + ' steps' }),
      plan,
      el('p', { class: 'note', text: 'Farming never guarantees a token or a reward. The $/hr verdict assumes a launch would distribute 5% of the implied value to farmers and one farmer in two thousand takes a share; change those assumptions and the verdict moves. Never pay anyone to claim for you, and never sign a transaction you do not understand.' })
    );
  }

  function selectRow(slug) {
    state.selected = slug;
    writeHash();
    render();
    var d = document.getElementById('detail');
    if (d) d.scrollIntoView();
  }

  function render() {
    app.textContent = '';
    var detail = detailView();
    // The board leads: header, controls, then the rows. The evidence panels
    // sit below the board, so the first screen a reader sees is the ranking
    // itself. When a protocol is open, its detail leads the page instead.
    if (detail) app.appendChild(detail);
    app.appendChild(header());
    app.appendChild(controls());
    app.appendChild(state.tab === 'ledger' ? ledgerView() : boardTable());
    app.appendChild(evidence());
    app.appendChild(el('footer', null,
      el('p', { text: 'Snapshot ' + DATA.as_of + ' \u00b7 Source: ' + DATA.source + ' \u00b7 Floor $' + DATA.floor_usd.toLocaleString('en-US') + ' \u00b7 Model ' + DATA.model_version + ': log10 market cap refit from ' + DATA.fit.comps + ' traded comparables, with a shrunk category offset. A protocol is called pre-token because its record carries no token, never as proof it has none. Implied value is an estimate, not a price, and not a prediction that a token will be issued.' })
    ));
    app.setAttribute('aria-busy', 'false');
    window.__ready = true;
  }

  readHash();
  render();
})();

