// Builds the static site in _site/ from the published Google Sheet (or the seed CSV before setup).
// Usage: node build/build.mjs        Env: SHEET_CSV_URL, BASE_URL (override site.config.json); OFFLINE=1 (use data/ only)
import fs from 'node:fs';
import path from 'node:path';
import { parseCSV, toCSV } from './csv.mjs';
import { groupChronology, chronoHTML, loadMaps, detailMapHTML, CHRONO_COLS, groupMedia, picturesHTML, creditHTML, MEDIA_COLS, mark } from './extras.mjs';
import { loadExercises, MOVES, MOVE_WORD } from './exercises.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, '_site');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
// OFFLINE=1 builds from the copies in data/ alone, for a preview of changes not yet in the sheet
const SHEET_URL = process.env.OFFLINE ? '' : (process.env.SHEET_CSV_URL || cfg.sheet_csv_url || '');
const BASE = (process.env.BASE_URL || cfg.base_url || '').replace(/\/?$/, '/');

const CASE_TYPES = ['missed', 'obvious', 'false-alarm', 'wrongly-blamed', 'still-open'];
// the codes used until October 2026, still accepted from the sheet
const LEGACY = { core: 'missed', contrast: 'obvious', control: 'false-alarm', misattribution: 'wrongly-blamed' };
// the October 2026 recoding, applied to rows that still carry an old code until sheet/rename_classes.gs has run
const RECODE = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'sheet', 'case_types_2026-10.json'), 'utf8')); } catch { return {}; } })();
const CONTEXTS = ['armed conflict', 'short of armed conflict', 'terrorism / non-state', 'criminal', 'no hostile act'];
const SERVICES = ['water', 'energy', 'food and agriculture', 'health', 'telecommunications and internet', 'transport', 'navigation and space', 'other'];
const TYPE_LABEL = { missed: 'Missed', obvious: 'Obvious', 'false-alarm': 'False alarm', 'wrongly-blamed': 'Wrongly blamed', 'still-open': 'Still open' };
const TYPE_TEXT = {
  missed: 'Each institution held part of the record, and no one put the parts together until late, or ever.',
  obvious: 'The attacker claimed the act, or a single target or simultaneous strikes made it plain, so the records did not need joining.',
  'false-alarm': 'Treated as a possible attack; the joined records settled it as an accident, a technical failure or a natural cause.',
  'wrongly-blamed': 'The records were joined into an attack claim that a later inquiry, a court or the evidence itself rejected.',
  'still-open': 'Treated as a possible attack, or claimed as one, and never settled either way.',
};
const PUBLIC_COLS = ['id', 'title', 'label', 'dates', 'year', 'place', 'lat', 'lon', 'more_sites', 'precision', 'case_type', 'scope', 'context', 'services', 'strength', 'summary', 'records', 'gap', 'joining', 'harm_found_later', 'sources', 'verification', 'added'];

const warnings = [];
const warn = m => { warnings.push(m); console.warn('WARN', m); };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// typographer's quotes for display; the CSV download keeps the sheet's own characters
const smart = s => String(s ?? '')
  .replace(/(^|[\s(\[{\u2013\u2014\/])"/g, '$1\u201C').replace(/"/g, '\u201D')
  .replace(/(^|[\s(\[{\u2013\u2014\/\u201C])'(?=\d\ds\b)/g, '$1\u2019')
  .replace(/(^|[\s(\[{\u2013\u2014\/\u201C])'/g, '$1\u2018').replace(/'/g, '\u2019');
const slug = id => id.toLowerCase();
const decadeOf = y => (y < 1960 ? 1945 : Math.floor(y / 10) * 10);

async function getCSV() {
  if (!SHEET_URL) {
    console.log('No sheet URL configured: building from data/events.seed.csv');
    return fs.readFileSync(path.join(ROOT, 'data', 'events.seed.csv'), 'utf8');
  }
  const res = await fetch(SHEET_URL, { redirect: 'follow', signal: AbortSignal.timeout(45000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`Sheet fetch failed: HTTP ${res.status}`);
  if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('The sheet URL returned a web page, not CSV. Publish the Events tab to the web as CSV and use that link.');
  if (!/^\uFEFF?"?id"?,/i.test(text)) throw new Error('The CSV does not start with the "id" column. Check that the published link points to the Events tab.');
  return text;
}

// a second tab of the same sheet (Chronology), read the same way as the Events tab; until the tab exists,
// or if it cannot be read, the copy in data/ is used
async function getTab(name, cols, seed) {
  const fallback = why => {
    const f = path.join(ROOT, 'data', seed);
    console.log(`${name}: ${why}; using ${fs.existsSync(f) ? `data/${seed}` : 'nothing'}`);
    return fs.existsSync(f) ? parseCSV(fs.readFileSync(f, 'utf8')) : [];
  };
  const url = cfg[`${name.toLowerCase()}_csv_url`] || (/[?&]sheet=/.test(SHEET_URL) ? SHEET_URL.replace(/([?&]sheet=)[^&]*/, `$1${name}`) + '&headers=1' : '');
  if (!url) return fallback('no sheet link');
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(45000) });
    const text = await res.text();
    if (!res.ok) return fallback(`HTTP ${res.status}`);
    const rows = parseCSV(text);
    // the Google endpoint returns the first tab when no tab has the name asked for, so check the columns
    if (!rows.length || !cols.every(c => c in rows[0])) return fallback(`no ${name} tab with the expected columns in the sheet`);
    console.log(`${name}: ${rows.length} rows from the sheet`);
    return rows;
  } catch (err) { return fallback(err.message); }
}

function normalize(r) {
  const id = (r.id || '').toUpperCase();
  if (!/^AG-\d{3,4}$/.test(id)) { warn(`Skipped a row with an invalid id: "${r.id}"`); return null; }
  const status = (r.status || '').toLowerCase();
  if (status !== 'published') return null;
  const year = parseInt(r.year, 10);
  if (!(year >= 1945 && year <= 2100)) { warn(`${id}: year "${r.year}" is not a number between 1945 and 2100; skipped`); return null; }
  const raw = (r.case_type || '').trim().toLowerCase().replace(/\s+/g, '-');
  const case_type = LEGACY[raw] ? (RECODE[id] || LEGACY[raw]) : raw;
  if (!CASE_TYPES.includes(case_type)) { warn(`${id}: case_type "${r.case_type}" is not one of ${CASE_TYPES.join(', ')}; skipped`); return null; }
  if (!r.title) { warn(`${id}: no title; skipped`); return null; }
  const context = CONTEXTS.includes((r.context || '').toLowerCase()) ? r.context.toLowerCase() : (r.context ? (warn(`${id}: unknown context "${r.context}"`), r.context) : '');
  const services = (r.services || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  services.filter(s => !SERVICES.includes(s)).forEach(s => warn(`${id}: unknown service "${s}"`));
  const lat = parseFloat(r.lat), lon = parseFloat(r.lon);
  const hasPt = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  if (!hasPt && (r.lat || r.lon)) warn(`${id}: coordinates "${r.lat}, ${r.lon}" are not valid; not mapped`);
  const more = (r.more_sites || '').split(';').map(p => p.split(',').map(x => parseFloat(x))).filter(p => p.length === 2 && p.every(Number.isFinite));
  const sources = (r.sources || '').split(/\n+/).map(line => {
    const k = line.lastIndexOf('|');
    const cite = (k >= 0 ? line.slice(0, k) : line).trim();
    const url = (k >= 0 ? line.slice(k + 1) : '').trim();
    return { cite, url: /^https?:\/\//i.test(url) ? url : '' };
  }).filter(s => s.cite || s.url);
  const strength = Math.min(3, Math.max(1, parseInt(r.strength, 10) || 1));
  const added = /^\d{4}-\d{2}-\d{2}$/.test(r.added || '') ? r.added : '';
  if (!added) warn(`${id}: "added" date missing or not YYYY-MM-DD; it will not appear in the email digest`);
  return {
    id, n: parseInt(id.slice(3), 10), title: r.title, label: r.label || r.title, dates: r.dates || String(year), year, decade: decadeOf(year),
    place: r.place || '', lat: hasPt ? lat : null, lon: hasPt ? lon : null, more, precision: r.precision || '',
    case_type, scope: (r.scope || '').toLowerCase() === 'adjacent' ? 'adjacent' : 'civilian service', context, services, strength,
    summary: r.summary || '', records: r.records || '', gap: r.gap || '', joining: r.joining || '',
    harm: r.harm_found_later || '', use: r.use_in_volume || '', sources, verification: r.verification || '', note: r.map_note || '', added,
  };
}

// ---------- page shell ----------
const INK = { missed: '#1f4f8f', obvious: '#00876f', 'false-alarm': '#9c6a00', 'wrongly-blamed': '#9a68c4', 'still-open': '#4d4237' };
const WASH = { missed: '#c7d3e3', obvious: '#bfe1db', 'false-alarm': '#ebdebf', 'wrongly-blamed': '#e6d9f0', 'still-open': '#e6dcc6' };
const TDEF = {
  missed: 'the pieces existed, but no one put them together until late, or ever',
  obvious: 'the attacker claimed it, or the target made it plain',
  'false-alarm': 'treated as a possible attack; turned out to be an accident or failure',
  'wrongly-blamed': 'joined into an attack claim that later fell apart',
  'still-open': 'suspected, never settled',
};
const NOTA = 'The register holds only events whose published record could be checked against its sources, most of them in English. Regions left blank and the thin early decades mark where documentation can be reached as well as where services were disrupted. Each mark stands for one entry, whatever the scale of the disruption.';
const DECADES = [1945, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
const decName = d => (d === 1945 ? '1945 to 1959' : d === 2020 ? '2020 to 2026' : `${d} to ${d + 9}`);
// first and last year named in the dates; the second is shortened only within the same century (1948–49, 1980–2022)
const yrs = e => { const m = String(e.dates).match(/(19|20)\d\d/g) || [String(e.year)]; const a = m[0], b = m[m.length - 1]; return a === b ? a : `${a}–${a.slice(0, 2) === b.slice(0, 2) ? b.slice(2) : b}`; };

function subscribeBlock(rel) {
  const s = cfg.subscribe || {};
  const rss = `<a href="${rel}feed.xml">RSS feed</a>`;
  if (s.form_action) {
    return `<form class="subscribe" action="${esc(s.form_action)}" method="post" target="_blank" rel="noopener">
      <label for="sub-email">A notice by email when new entries are added</label>
      <div class="subrow"><input id="sub-email" type="email" name="${esc(s.email_field || 'email')}" required placeholder="name@university.edu" autocomplete="email"><button type="submit">Subscribe</button></div>
      <p class="fine">Sent by ${esc(s.provider_name || 'our newsletter service')}. Every notice carries a link to unsubscribe. The ${rss} carries the same notices.</p>
    </form>`;
  }
  if (s.page_url) return `<div class="subscribe"><p>A notice by email when new entries are added.</p><a class="button" href="${esc(s.page_url)}" target="_blank" rel="noopener">Subscribe</a><p class="fine">The ${rss} carries the same notices.</p></div>`;
  return `<div class="subscribe"><p>Notices by email will begin shortly. Until then, new entries are announced in the ${rss}.</p></div>`;
}
function suggestBlock() {
  if (cfg.suggest_url) return `<p><a class="button ghost" href="${esc(cfg.suggest_url)}" target="_blank" rel="noopener">Suggest an event</a></p>`;
  if (cfg.contact_email) return `<p>To suggest an event, write to <span class="sel">${esc(cfg.contact_email)}</span>.</p>`;
  return '';
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const edition = (d => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`)(new Date());
let ENTRY_COUNT = 0;
// the bottom margin of the sheet: production notes at left, edition and data at right, as on a survey sheet
function imprint(rel) {
  return `<footer class="imprint">
  <div class="imp-l">
    <p>Compiled from published sources by the ${esc(cfg.credit)}. Each entry checked against its sources by a second reader.</p>
    <p>Equal Earth projection centered on 10° E. Coastlines from Natural Earth. Boundaries from CShapes 2.0 (Schvitz et al. 2022), licensed <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" rel="license noopener">CC BY-NC-SA 4.0</a>. Set in Libre Caslon Text and Libre Franklin.</p>
  </div>
  <div class="imp-r">
    <p>Edition of ${edition}, ${ENTRY_COUNT} entries</p>
    <p><a href="${rel}data/events.csv">CSV</a> <a href="${rel}data/events.json">JSON</a> <a href="${rel}feed.xml">RSS</a> <a href="${rel}credits.html">Picture credits</a></p>
  </div>
</footer>`;
}
function page({ title, rel, body, desc, current = '', wide = false }) {
  const nav = [['index.html', 'Plate', 'plate'], ['events/index.html', 'Register', 'register'], ['exercises/index.html', 'Exercises', 'exercises'], ['about.html', 'About', 'about'], ['about.html#subscribe', 'Notices by email', '']]
    .map(([h, t, k]) => `<a href="${rel}${h}"${current && current === k ? ' aria-current="page"' : ''}>${t}</a>`).join('<span class="sep" aria-hidden="true">·</span>');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc || cfg.subtitle)}">
<link rel="preload" href="${rel}assets/fonts/libre-caslon-text-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${rel}assets/fonts/libre-franklin-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${rel}assets/css/site.css">
<link rel="alternate" type="application/rss+xml" title="${esc(cfg.title)}: new entries" href="${rel}feed.xml">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<div class="sheet${wide ? '' : ' leaf'}">
<header class="running"><nav aria-label="Sections">${nav}</nav></header>
${body}
${imprint(rel)}
</div>
</body>
</html>`;
}
function holdersHTML(s) {
  const lines = String(s || '').split(/\n+/).map(l => l.trim()).filter(Boolean);
  const isList = lines.length > 1 || (lines.length === 1 && /^[^:;,]{2,60}:\s/.test(lines[0]) && !lines[0].includes(';'));
  if (!isList) return s ? `<p>${esc(s)}</p>` : '';
  return `<ul class="holders">${lines.map(l => { const k = l.indexOf(':'); return k > 0 && k < 90 ? `<li><i>${esc(l.slice(0, k))}:</i> ${esc(l.slice(k + 1).trim())}</li>` : `<li>${esc(l)}</li>`; }).join('')}</ul>`;
}
const runhead = rel => `<p class="runhead"><a href="${rel}index.html">The Aggregation Gap</a></p>`;

// the marks of the plate, as small inline figures
function shapeSVG(e, size = 13) {
  const s = 3.6, c = INK[e.case_type] || '#121212', w = WASH[e.case_type] || '#fff';
  let d, fill = w, sw = 1.35;
  if (e.scope === 'adjacent') { d = `M${-s},${-s}h${2 * s}v${2 * s}h${-2 * s}Z`; fill = e.case_type === 'missed' ? c : w; sw = 1.2; }
  else if (e.case_type === 'missed' || e.case_type === 'obvious') { d = `M${-s},0a${s},${s} 0 1,0 ${2 * s},0a${s},${s} 0 1,0 ${-2 * s},0Z`; if (e.case_type === 'missed') { fill = c; sw = 0.8; } }
  else if (e.case_type === 'false-alarm') d = `M0,${-s * 1.3}L${s * 1.18},${s * 0.82}L${-s * 1.18},${s * 0.82}Z`;
  else if (e.case_type === 'still-open') d = `M0,${-s * 1.3}L${s * 1.3},0L0,${s * 1.3}L${-s * 1.3},0Z`;
  else { d = `M${-s},${-s}L${s},${s}M${-s},${s}L${s},${-s}`; fill = 'none'; sw = 1.9; }
  return `<svg width="${size}" height="${size}" viewBox="-6.5 -6.5 13 13" aria-hidden="true"><path d="${d}" fill="${fill}" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/></svg>`;
}

// the register as plain links: the whole list without JavaScript, and the starting state of the plate page
function registerHTML(events, hrefOf, counts = false) {
  const groups = {};
  [...events].sort((a, b) => a.year - b.year || a.n - b.n).forEach(e => (groups[e.decade] = groups[e.decade] || []).push(e));
  return DECADES.filter(d => groups[d]).map(d => `<div class="reg-group"><h3>${decName(d)}${counts ? `<span>${groups[d].length}</span>` : ''}</h3><ul class="reg-list">${groups[d].map(e =>
    `<li><a href="${hrefOf(e)}">${shapeSVG(e, 11)}<span class="no">${e.n}</span><span class="lt">${esc(e.label)}${e.lat == null ? ' <span class="unplaced">(not placed)</span>' : ''}</span><span class="lead"></span><span class="yr">${yrs(e)}</span></a></li>`).join('')}</ul></div>`).join('');
}

// Equal Earth, centred on 10° E, as d3 draws it for the 300 px locator base map (assets/img/locator.svg)
const LOC = { w: 300, h: 133, k: 55.41947030201945, tx: 150, ty: 72.41734999382291 };
function locate(lon, lat) {
  const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
  const lam = ((((lon - 10 + 540) % 360) + 360) % 360 - 180) * Math.PI / 180, phi = lat * Math.PI / 180;
  const l = Math.asin(M * Math.sin(phi)), l2 = l * l, l6 = l2 * l2 * l2;
  const x = lam * Math.cos(l) / (M * (A1 + 3 * A2 * l2 + l6 * (7 * A3 + 9 * A4 * l2)));
  const y = l * (A1 + A2 * l2 + l6 * (A3 + A4 * l2));
  return [x * LOC.k + LOC.tx, -y * LOC.k + LOC.ty].map(v => Math.round(v * 10) / 10);
}
const fmtCoord = (lat, lon) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;

// ---------- pages ----------
function indexPage(events) {
  const last = Math.max(...events.map(e => e.year));
  const opt = list => list.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  const body = `<header class="plate-title">
  <span class="pt-no">Plate I.</span>
  <h1>The Aggregation Gap</h1>
  <span class="pt-yrs">1945–${last}</span>
  <p class="pt-sub">Disruptions of civilian services in which the record was held in parts</p>
</header>
<main id="main">
<section id="plate" aria-label="Map plate">
  <div class="platewrap">
    <p class="plate-loading" id="plate-loading">Loading the plate…</p>
    <noscript><style>#plate-loading { display: none; }</style><p class="plate-loading">The plate needs JavaScript. Every entry is listed in the register below.</p></noscript>
    <svg class="plate" id="plate-svg" role="img" aria-label="World map of the register's entries; the register below lists the same entries for keyboard use" hidden></svg>
    <div class="zoom js-only" role="group" aria-label="Zoom" hidden><button type="button" id="zin" aria-label="Zoom in">+</button><button type="button" id="zout" aria-label="Zoom out">−</button><button type="button" id="zall" aria-label="Show the whole world">ALL</button></div>
    <div class="reference js-only" id="reference" hidden><h2>Reference</h2></div>
  </div>
  <svg class="scale js-only" id="scale-svg" role="group" aria-label="Scale of years; select a span to show one period" hidden></svg>
  <p class="scalenote js-only" hidden><span id="scale-state">All years shown</span><button type="button" id="all-years" hidden>Show all years</button></p>
  <p class="nota"><b>NOTA</b>${esc(NOTA)}</p>
</section>

<section class="record-panel" id="record" hidden aria-live="polite"></section>

<section class="register" id="register">
  <h2>Register</h2>
  <p class="note">of entries shown on the plate, by period</p>
  <div class="find js-only" hidden>
    <label for="q">Find<input id="q" type="search" autocomplete="off"></label>
    <label for="svc">Service<select id="svc"><option value="">all</option>${opt(SERVICES)}</select></label>
    <label for="ctx">Context<select id="ctx"><option value="">all</option>${opt(CONTEXTS)}</select></label>
    <label class="tick"><input type="checkbox" id="harm"> Harm found later</label>
    <label class="tick"><input type="checkbox" id="vfy"> Verified in full</label>
    <span class="count" id="count"></span>
  </div>
  <div id="reg">${registerHTML(events, e => `events/${slug(e.id)}/index.html`)}</div>
</section>
</main>
<script src="assets/vendor/d3.min.js"></script>
<script src="assets/vendor/topojson-client.min.js"></script>
<script src="assets/js/plate.js"></script>`;
  return page({ title: cfg.title, rel: '', body, current: 'plate', wide: true });
}

function eventsIndexPage(events) {
  const body = `${runhead('../')}
<main id="main" class="register">
  <h1 class="page-h">Register</h1>
  <p class="page-note">of all ${events.length} entries, by period; each opens its full record</p>
  ${registerHTML(events, e => `${slug(e.id)}/index.html`, true)}
</main>`;
  return page({ title: `Register · ${cfg.title}`, rel: '../', body, current: 'register' });
}

let CHRONO = {}, MAPS = { has: () => false }, MEDIA = {};
function extrasHTML(e, rel) {
  const c = chronoHTML(e, CHRONO[e.id], INK[e.case_type]), m = detailMapHTML(e, MAPS, rel), p = picturesHTML(e, MEDIA[e.id]);
  return c || m || p ? `<section class="rec-extra">${c}${m}${p}</section>` : '';
}
const cap = t => (t ? t[0].toUpperCase() + t.slice(1) : t);
// the register's own entry date, as a clerk's stamp: 22 OCT 2026
const stampDate = d => { const [y, m, dd] = d.split('-').map(Number); return `${dd} ${MONTHS[m - 1].slice(0, 3).toUpperCase()} ${y}`; };
function eventPage(e, prev, next) {
  const url = `${BASE}events/${slug(e.id)}/`;
  let loc = '';
  if (e.lat != null) {
    const [x, y] = locate(e.lon, e.lat);
    loc = `<figure class="locator"><div class="lmap"><img src="../../assets/img/locator.svg" width="${LOC.w}" height="${LOC.h}" alt="World map marking the position of the event">` +
      `<svg viewBox="0 0 ${LOC.w} ${LOC.h}" aria-hidden="true"><g stroke="#b3261e" stroke-width="0.9" fill="none"><circle cx="${x}" cy="${y}" r="5"/><path d="M${x - 11},${y}h7M${x + 4},${y}h7M${x},${y - 11}v7M${x},${y + 4}v7"/></g></svg></div>` +
      `<figcaption>${fmtCoord(e.lat, e.lon)}${e.precision === 'approximate' ? ', approximate' : e.precision === 'area' ? ', center of the area concerned' : ''}</figcaption></figure>`;
  }
  const cls = `${shapeSVG(e)} ${TYPE_LABEL[e.case_type]}${e.scope === 'adjacent' ? ', adjacent case' : ''}: ${TDEF[e.case_type]}.`;
  const ri = (head, text) => (text ? `<p class="para"><span class="ri">${head}.</span>—${esc(text)}</p>` : '');
  const auth = e.sources.length ? `<h2 class="sh">Authorities</h2><ol class="authorities">${e.sources.map(s => `<li>${esc(s.cite)}${s.url ? ` <a href="${esc(s.url)}" rel="noopener">${esc(s.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0])}</a>` : ''}</li>`).join('')}</ol>` : '';
  const body = `${runhead('../../')}
<main id="main">
<article class="record printed">
  <div class="rec-head docket">
    <p class="dk-no">No. <span>${esc(e.id)}</span></p>
    <h1>${esc(e.title)}</h1>
    <p class="dk-meta">${TYPE_LABEL[e.case_type]}<span>·</span>${esc(e.dates)}</p>
    ${e.added ? `<p class="dk-stamp">Register<b>${stampDate(e.added)}</b></p>` : ''}
  </div>
  <p class="abstract">${esc(e.dates)}. ${esc(e.place)}. ${esc(cap(e.services.join(', ')))}${e.context ? `; ${esc(e.context)}` : ''}.<br>${cls}</p>
  ${e.lat != null ? loc.replace('<figure class="locator">', '<figure class="locator inset">') : ''}
  ${ri('Summary', e.summary)}
  ${e.records ? `<h2 class="sh">Holders of the record</h2>${holdersHTML(e.records)}` : ''}
  ${ri('Why the records stayed apart', e.gap)}
  ${ri('Joining', e.joining)}
  ${ri('Harm found later', e.harm)}
  ${auth}
  ${e.verification ? `<p class="small"><span class="ri">Verification.</span>—${esc(e.verification)}</p>` : ''}
  <p class="small cite"><span class="ri">To cite.</span>—${esc(cfg.title)}, entry ${e.id}, “${esc(e.title)}.” ${esc(cfg.credit)}. ${esc(url)}</p>
  <p class="rec-links">${e.lat != null ? `<a href="../../index.html#${slug(e.id)}">Shown on the plate</a><span class="sep" aria-hidden="true">·</span>` : ''}${EX_OF[e.id] ? `<a href="../../exercises/${slug(e.id)}/index.html">Played as Exercise No. ${EX_OF[e.id].no}</a><span class="sep" aria-hidden="true">·</span>` : ''}<a href="../index.html">The whole register</a></p>
</article>
${extrasHTML(e, '../../')}
<nav class="pn" aria-label="Neighbouring entries">${prev ? `<a href="../${slug(prev.id)}/index.html">← No. ${prev.n}, ${esc(prev.label)}</a>` : '<span></span>'}${next ? `<a href="../${slug(next.id)}/index.html">No. ${next.n}, ${esc(next.label)} →</a>` : ''}</nav>
</main>`;
  return page({ title: `${e.id} ${e.title} · ${cfg.title}`, rel: '../../', body, desc: e.summary.slice(0, 200), current: 'register' });
}

// ---------- exercises ----------
let EXERCISES = [], EX_OF = {};
const seatsOf = x => [...new Set(x.points.map(p => p.as))];
const inTurn = list => list.length === 1 ? list[0] : `${list.slice(0, -1).join(', then as ')}, then as ${list[list.length - 1]}`;
function exercisesIndexPage(list) {
  const body = `${runhead('../')}
<main id="main" class="text exercises">
  <h1>Exercises</h1>
  <p class="lede">Each exercise puts you in the chair of an institution that held part of a record, at the moments when it had to act.</p>
  <p>You see what that institution had before it: its own records, and what others had reported or made public. You choose a move, and may minute your reason. Then you see what the institution did, and what others knew at the time that it did not. The class the register gives the entry is withheld until the debrief, where your minutes are set beside theirs. Nothing is scored.</p>
  <p>The facts shown at each point are the entry’s own: rows of its chronology, or its words. The moves offered are possibilities, and one of them is what was done.</p>
  <p class="x-pilot">A trial set of ${list.length}, one from each class of the register.</p>
  <ol class="x-list">${list.map(x => `<li><a href="${slug(x.id)}/index.html"><span class="x-no">No. ${x.no}</span><span class="x-ti">${esc(x.title)}</span><span class="x-pe">${esc(x.period)}</span><span class="x-se">As ${esc(seatsOf(x).join('; '))}</span><span class="x-pt">${x.points.length} points of decision</span></a></li>`).join('')}</ol>
</main>`;
  return page({ title: `Exercises · ${cfg.title}`, rel: '../', body, current: 'exercises' });
}
function exercisePage(x, e) {
  const ri = (head, text) => (text ? `<p class="para"><span class="ri">${head}.</span>—${esc(text)}</p>` : '');
  const used = MOVES.concat(['event', 'other']);
  // the marks are drawn in plain ink, since the colour of the class would give the class away before the debrief
  const data = { id: x.id, points: x.points, marks: Object.fromEntries(used.map(k => [k, mark(k, '#2b2118')])), words: MOVE_WORD };
  const c = chronoHTML(e, CHRONO[e.id], INK[e.case_type]);
  const body = `${runhead('../../')}
<main id="main" class="exercise">
<div class="rec-head docket x-docket">
  <p class="dk-no">Exercise <span>No. ${x.no}</span></p>
  <h1>${esc(x.title)}</h1>
  <p class="dk-meta">${esc(x.period)}<span>·</span>${x.points.length} points of decision</p>
</div>
<div class="x-brief">
  <p>You will decide as ${esc(inTurn(seatsOf(x)))}. At each point you see what that institution had before it: its own records, and what others had reported or made public. Choose a move, minute your reason if you wish, and then see what it did, and what others knew that it did not.</p>
  <p>The class the register gives this entry is withheld until the debrief. Nothing is scored.</p>
  <p class="x-start js-only" hidden><button type="button" class="button" id="x-begin">Open the file</button></p>
  <noscript><p>The exercise needs JavaScript. The full record is entry <a href="../../events/${slug(x.id)}/index.html">${esc(x.id)}</a> of the register.</p></noscript>
</div>
<div id="x-points"></div>
<section class="x-debrief" id="x-debrief" hidden>
  <h2 class="sh" tabindex="-1">Debrief</h2>
  <p class="x-class">The register classes this entry as ${shapeSVG(e)} <b>${TYPE_LABEL[e.case_type]}</b>: ${TDEF[e.case_type]}.</p>
  <table class="x-minutes"><caption>Your minutes and theirs</caption><thead><tr><th scope="col">Point</th><th scope="col">Your move</th><th scope="col">What was done</th></tr></thead><tbody id="x-mins"></tbody></table>
  <ul class="ch-key x-key" id="x-key"></ul>
  <div class="printed x-text">
  ${ri('Why the records stayed apart', e.gap)}
  ${ri('Joining', e.joining)}
  ${ri('Harm found later', e.harm)}
  </div>
  ${c ? `<section class="rec-extra">${c}</section>` : ''}
  <p class="rec-links x-links"><a href="../../events/${slug(x.id)}/index.html">The full entry, ${esc(x.id)}</a><span class="sep" aria-hidden="true">·</span><button type="button" id="x-again">Play it again</button><span class="sep" aria-hidden="true">·</span><a href="../index.html">The other exercises</a></p>
</section>
<script type="application/json" id="x-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
</main>
<script src="../../assets/js/exercise.js"></script>`;
  return page({ title: `Exercise ${x.no}: ${x.title} · ${cfg.title}`, rel: '../../', body, desc: `A decision-forcing exercise on entry ${x.id} of the register.`, current: 'exercises' });
}

function aboutPage(events) {
  const counts = CASE_TYPES.map(t => [t, events.filter(e => e.case_type === t).length]).filter(([, n]) => n).map(([t, n]) => `${n} ${TYPE_LABEL[t].toLowerCase()}`).join(', ');
  const body = `${runhead('')}
<main id="main" class="text">
  <h1>About the atlas</h1>
  <p class="lede">The atlas maps disruptions of civilian services since 1945 in which operators, regulators, insurers, health authorities, police and intelligence agencies each recorded one part of what happened, for their own purposes and under their own rules.</p>
  <h2>The aggregation gap</h2>
  <p>All of these records may be accurate and still leave unclear what happened, because joining them, and deciding that an event was an attack, lies outside the purpose for which each was kept. An aggregation gap opens where institutions hold observations that could support a more extensive interpretation but lack the means or the authority to take them together. It widens as recorders become more numerous and smaller, as each applies its own threshold, and as no institution with authority to join the records receives them. It narrows when the attacker makes the act public or strikes a single target.</p>
  <h2>Classification of entries</h2>
  <dl class="types">${CASE_TYPES.map(t => `<dt>${shapeSVG({ case_type: t })}${TYPE_LABEL[t]}</dt><dd>${TYPE_TEXT[t]}</dd>`).join('')}<dt>${shapeSVG({ scope: 'adjacent' })}Adjacent</dt><dd>The target was a commercial or defense site whose records stayed apart in the same way as those of a civilian service. The square takes the color of its class.</dd></dl>
  <p>The register now holds ${events.length} entries (${counts}).</p>
  <h2>How the entries are made</h2>
  <p>Each entry was drafted from published sources. A second, independent pass then checked it against those sources and corrected or removed any claim they did not support. The verification line on each entry gives the result. Where an entry is only partly verified, the line names what remains open.</p>
  <p><i>Nota.</i> ${esc(NOTA)}</p>
  <h2>How the plate is drawn</h2>
  <p>The plate borrows its drawing from atlas sheets now in the public domain. The water lining along the coasts comes from S. Augustus Mitchell’s <i>Europe</i> (1849), and the graduated border with its degree figures from Keith Johnston’s <i>General Atlas</i> (1861) and Stieler’s <i>Hand-Atlas</i> (1891). Red marks the selected entry, as red marks the present boundary on the 1961 Algeria–Libya map prepared for the State Department’s Office of the Geographer. Under the plate, the scale of years stacks one bar for each entry, much as John Snow stacked one bar for each death on his cholera map of 1855. The boundaries are those of the period selected, as they stood on the date given in the reference box.</p>
  <h2>Chronologies, maps and pictures</h2>
  <p>Under each entry, a chronology sets out the dated moments in its record: when the disruption happened, when each holder recorded or reported its part, when someone made a finding or named an attacker, and when the records were joined, if they ever were. The rows are drawn from the entry’s own text and checked against it by a second reader; a moment the entry does not date is left out. Where a date is known only to the month or year, the strip draws a bar across that period.</p>
  <p>The detail map shows the area of the event. Its boundaries are those of the entry’s year, from CShapes 2.0; coastlines, lakes, rivers, railways, main roads and towns come from Natural Earth and are drawn as they are today, so a railway shown may postdate the event. Each map uses an azimuthal equal-area projection centered on the site, and can be downloaded as SVG.</p>
  <p>Each entry carries one or two pictures, from Wikimedia Commons and NASA only and only under public-domain or Creative Commons terms that allow reuse with credit. A picture shows the site, the object or the damage the entry names, or a document of its record. Where no such picture could be found, the entry shows the place where the event happened, under the heading “The place”, or, for an event with no place of its own, the building of an institution that held part of its record, under the heading “A holder of the record”; the caption says what is shown and when it was taken. Each picture was chosen by one reader and checked by a second against its source page. The <a href="credits.html">picture credits</a> list them all.</p>
  <h2 id="suggest">Suggest an event</h2>
  <p>Suggestions are reviewed by the editors before anything is published.</p>
  ${suggestBlock()}
  <h2 id="subscribe">Notices by email</h2>
  ${subscribeBlock('')}
  <h2>Credits and licences</h2>
  <p>${esc(cfg.credit)}. Prepared for the edited volume <i>${esc(cfg.volume)}</i>. Coastlines on the plate: Natural Earth, public domain, via world-atlas. Detail maps: Natural Earth 1:10m coastlines, lakes, rivers, railways, roads and populated places, public domain. Boundaries: CShapes 2.0, Schvitz, Guy, Seraina Rüegger, Luc Girardin, Lars-Erik Cederman, Nils Weidmann and Kristian Skrede Gleditsch, “Mapping the International System, 1886–2017: The CShapes 2.0 Dataset,” <i>Journal of Conflict Resolution</i> 66, no. 1 (2022): 144–61, licensed CC BY-NC-SA 4.0. Type: Libre Caslon Text and Libre Franklin, SIL Open Font License. Drawing: d3 and topojson. Pictures: see the <a href="credits.html">picture credits</a>.</p>
</main>`;
  return page({ title: `About · ${cfg.title}`, rel: '', body, current: 'about' });
}

function creditsPage(events) {
  const withPics = events.filter(e => MEDIA[e.id]);
  const n = withPics.reduce((k, e) => k + MEDIA[e.id].length, 0);
  const body = `${runhead('')}
<main id="main" class="text credits">
  <h1>Picture credits</h1>
  <p class="lede">The ${n} pictures on the entry pages come from Wikimedia Commons and NASA and are either in the public domain or under a Creative Commons license that allows reuse with credit (CC0, CC BY or CC BY-SA). Each is shown as its source publishes it, and each links to the page where its author, date and license are recorded.</p>
  <p>A picture shows the site, the object or the damage an entry names, or a document of its record. Where no such picture could be found, it shows the place where the event happened, or the building of an institution that held part of the record, and its heading on the entry page says so. Pictures of the dead or injured, and pictures in which a private person can be recognized, are not used. Captions say no more than the source and the entry do.</p>
  <ol class="credit-list">${withPics.map(e => MEDIA[e.id].map(m => `<li><a href="events/${slug(e.id)}/index.html">${esc(e.id)}</a> ${esc(m.caption)} <span class="credit">${creditHTML(m)}</span></li>`).join('')).join('')}</ol>
</main>`;
  return page({ title: `Picture credits · ${cfg.title}`, rel: '', body });
}

function feed(events) {
  const items = events.filter(e => e.added).sort((a, b) => b.added.localeCompare(a.added) || b.n - a.n).slice(0, 50);
  const date = d => new Date(d + 'T12:00:00Z').toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${esc(cfg.title)}: new events</title>
<link>${esc(BASE)}</link>
<atom:link href="${esc(BASE)}feed.xml" rel="self" type="application/rss+xml"/>
<description>${esc(cfg.subtitle)}</description>
<language>en-us</language>
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items.map(e => `<item>
<title>${esc(e.id)} ${esc(e.title)}</title>
<link>${esc(BASE)}events/${slug(e.id)}/</link>
<guid isPermaLink="true">${esc(BASE)}events/${slug(e.id)}/</guid>
<pubDate>${date(e.added)}</pubDate>
<description>${esc(`<p><b>${e.dates} · ${e.place} · ${TYPE_LABEL[e.case_type]}</b></p><p>${e.summary}</p>${e.gap ? `<p><i>Why it stayed apart.</i> ${e.gap}</p>` : ''}`)}</description>
</item>`).join('\n')}
</channel>
</rss>
`;
}

// ---------- main ----------
const csv = await getCSV();
const raw = parseCSV(csv);
const seen = new Set();
const events = [];
for (const r of raw) {
  const e = normalize(r);
  if (!e) continue;
  if (seen.has(e.id)) { warn(`${e.id}: duplicate id; second row skipped`); continue; }
  seen.add(e.id); events.push(e);
}
if (!events.length) throw new Error('No published events found. Nothing was deployed.');
events.sort((a, b) => a.n - b.n);
ENTRY_COUNT = events.length;
const TEXT_FIELDS = ['title', 'label', 'dates', 'place', 'summary', 'records', 'gap', 'joining', 'harm', 'verification'];
const shown = events.map(e => ({ ...e, ...Object.fromEntries(TEXT_FIELDS.map(f => [f, smart(e[f])])), sources: e.sources.map(x => ({ ...x, cite: smart(x.cite) })) }));
const chronoRows = await getTab('Chronology', ['id', 'date', 'kind', 'note'], 'chronology.seed.csv');
CHRONO = groupChronology(chronoRows.map(r => ({ ...r, holder: smart(r.holder), note: smart(r.note), date_text: smart(r.date_text) })), new Set(events.map(e => e.id)), warn);
MAPS = loadMaps(ROOT);
const mediaRows = await getTab('Media', ['id', 'site_url', 'caption', 'status'], 'media.seed.csv');
MEDIA = groupMedia(mediaRows.map(r => ({ ...r, caption: smart(r.caption), alt: smart(r.alt), author: smart(r.author) })), new Set(events.map(e => e.id)), warn);
EXERCISES = loadExercises(ROOT, events, CHRONO, warn, smart);
EX_OF = Object.fromEntries(EXERCISES.map(x => [x.id, x]));
console.log(`Exercises: ${EXERCISES.length}`);
console.log(`Chronologies for ${Object.keys(CHRONO).length} entries; detail maps for ${events.filter(e => MAPS.has(e.id)).length}; pictures for ${Object.keys(MEDIA).length}`);

fs.rmSync(OUT, { recursive: true, force: true });
const write = (p, s) => { const f = path.join(OUT, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const copyDir = (src, dst) => fs.cpSync(path.join(ROOT, src), path.join(OUT, dst), { recursive: true });

copyDir('assets', 'assets');
write('index.html', indexPage(shown));
write('about.html', aboutPage(shown));
write('events/index.html', eventsIndexPage(shown));
shown.forEach((e, i) => write(`events/${slug(e.id)}/index.html`, eventPage(e, shown[i - 1], shown[i + 1])));
write('feed.xml', feed(shown));
write('credits.html', creditsPage(shown));
if (EXERCISES.length) {
  write('exercises/index.html', exercisesIndexPage(EXERCISES));
  EXERCISES.forEach(x => write(`exercises/${slug(x.id)}/index.html`, exercisePage(x, shown.find(e => e.id === x.id))));
}
write('data/media.csv', toCSV(mediaRows.filter(r => String(r.status || '').toLowerCase() === 'published'), MEDIA_COLS));
// what the plate and its record need
write('data/events.json', JSON.stringify(shown.map(e => ({
  id: e.id, n: e.n, label: e.label, title: e.title, dates: e.dates, year: e.year, decade: e.decade, place: e.place,
  lat: e.lat, lon: e.lon, more: e.more, precision: e.precision, case_type: e.case_type, scope: e.scope, context: e.context, services: e.services,
  strength: e.strength, summary: e.summary, records: e.records, gap: e.gap, joining: e.joining, harm: e.harm,
  sources: e.sources, verification: e.verification, verified: /^verified/i.test(e.verification), url: `events/${slug(e.id)}/index.html`,
}))));
write('data/chronology.csv', toCSV(chronoRows.filter(r => r.id), CHRONO_COLS));
write('data/events.csv', toCSV(events.map(e => ({
  ...e, more_sites: e.more.map(p => p.join(', ')).join('; '), services: e.services.join(', '),
  harm_found_later: e.harm, sources: e.sources.map(s => `${s.cite} | ${s.url}`).join('\n'),
})), PUBLIC_COLS));
const root = BASE.replace(/^https?:\/\/[^/]+/, '');
write('404.html', page({ title: `Not found · ${cfg.title}`, rel: root, body: `${runhead(root)}<main id="main" class="text"><h1>Not found</h1><p>The page may have moved. Start from the <a href="${root}index.html">plate</a> or the <a href="${root}events/index.html">register</a>.</p></main>` }));
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['', 'about.html', 'credits.html', 'events/'].concat(events.map(e => `events/${slug(e.id)}/`), EXERCISES.length ? ['exercises/'].concat(EXERCISES.map(x => `exercises/${slug(x.id)}/`)) : []).map(u => `<url><loc>${esc(BASE + u)}</loc></url>`).join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${BASE}sitemap.xml\n`);
write('.nojekyll', '');

console.log(`Built ${events.length} published events (${raw.length} rows read) into _site/`);
if (warnings.length) console.log(`${warnings.length} warning(s); see above.`);
