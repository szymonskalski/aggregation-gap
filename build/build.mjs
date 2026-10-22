// Builds the static site in _site/ from the published Google Sheet (or the seed CSV before setup).
// Usage: node build/build.mjs        Env: SHEET_CSV_URL, BASE_URL (override site.config.json)
import fs from 'node:fs';
import path from 'node:path';
import { parseCSV, toCSV } from './csv.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, '_site');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const SHEET_URL = process.env.SHEET_CSV_URL || cfg.sheet_csv_url || '';
const BASE = (process.env.BASE_URL || cfg.base_url || '').replace(/\/?$/, '/');

const CASE_TYPES = ['core', 'contrast', 'control', 'misattribution'];
const CONTEXTS = ['armed conflict', 'short of armed conflict', 'terrorism / non-state', 'criminal', 'no hostile act'];
const SERVICES = ['water', 'energy', 'food and agriculture', 'health', 'telecommunications and internet', 'transport', 'navigation and space', 'other'];
const TYPE_LABEL = { core: 'Core', contrast: 'Contrast', control: 'Control', misattribution: 'Misattribution' };
const TYPE_TEXT = {
  core: 'Records stayed dispersed; recognition came late or never.',
  contrast: 'The gap narrowed: the attacker claimed the act, or one target or a simultaneous strike made it plain.',
  control: 'A suspected attack that institutions joined and settled as non-hostile, or left open.',
  misattribution: 'Records joined into an attack claim that later failed or remains disputed.',
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

function normalize(r) {
  const id = (r.id || '').toUpperCase();
  if (!/^AG-\d{3,4}$/.test(id)) { warn(`Skipped a row with an invalid id: "${r.id}"`); return null; }
  const status = (r.status || '').toLowerCase();
  if (status !== 'published') return null;
  const year = parseInt(r.year, 10);
  if (!(year >= 1945 && year <= 2100)) { warn(`${id}: year "${r.year}" is not a number between 1945 and 2100; skipped`); return null; }
  const case_type = (r.case_type || '').toLowerCase();
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
const INK = { core: '#1f4f8f', contrast: '#00876f', control: '#b07a00', misattribution: '#9a68c4' };
const WASH = { core: '#c7d3e3', contrast: '#bfe1db', control: '#ebdebf', misattribution: '#e6d9f0' };
const TDEF = {
  core: 'records stayed apart; recognized late or never',
  contrast: 'act claimed, or a single target made it plain',
  control: 'suspected attack, settled as non-hostile or left open',
  misattribution: 'attack claim that failed or is disputed',
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
    <p>Equal Earth projection centred on 10° E. Coastlines from Natural Earth. Boundaries from CShapes 2.0 (Schvitz et al. 2022), licensed <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" rel="license noopener">CC BY-NC-SA 4.0</a>. Set in Libre Caslon Text and Libre Franklin.</p>
  </div>
  <div class="imp-r">
    <p>Edition of ${edition}, ${ENTRY_COUNT} entries</p>
    <p><a href="${rel}data/events.csv">CSV</a> <a href="${rel}data/events.json">JSON</a> <a href="${rel}feed.xml">RSS</a></p>
  </div>
</footer>`;
}
function page({ title, rel, body, desc, current = '' }) {
  const nav = [['index.html', 'Plate', 'plate'], ['events/index.html', 'Register', 'register'], ['about.html', 'About', 'about'], ['about.html#subscribe', 'Notices by email', '']]
    .map(([h, t, k]) => `<a href="${rel}${h}"${current && current === k ? ' aria-current="page"' : ''}>${t}</a>`).join('');
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
<div class="sheet">
<div class="collar-top">
  <span>${esc(cfg.credit)}</span>
  <nav aria-label="Sections">${nav}</nav>
</div>
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
  if (e.scope === 'adjacent') { d = `M${-s},${-s}h${2 * s}v${2 * s}h${-2 * s}Z`; fill = e.case_type === 'core' ? c : w; sw = 1.2; }
  else if (e.case_type === 'core' || e.case_type === 'contrast') { d = `M${-s},0a${s},${s} 0 1,0 ${2 * s},0a${s},${s} 0 1,0 ${-2 * s},0Z`; if (e.case_type === 'core') { fill = c; sw = 0.8; } }
  else if (e.case_type === 'control') d = `M0,${-s * 1.3}L${s * 1.18},${s * 0.82}L${-s * 1.18},${s * 0.82}Z`;
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
  const body = `<header class="titleblock">
  <p class="plate-no">PLATE I</p>
  <h1>The Aggregation Gap</h1>
  <p class="sub">Disruptions of civilian services in which the record was held in parts, 1945 to ${last}</p>
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

<article class="record" id="record" hidden aria-live="polite"></article>

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
  return page({ title: cfg.title, rel: '', body, current: 'plate' });
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

function eventPage(e, prev, next) {
  const row = (dt, dd) => (dd ? `<dt>${dt}</dt><dd>${dd}</dd>` : '');
  const p = s => (s ? `<p>${esc(s)}</p>` : '');
  const src = e.sources.length ? `<ol>${e.sources.map(s => `<li>${esc(s.cite)}${s.url ? ` <a href="${esc(s.url)}" rel="noopener">${esc(s.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0])}</a>` : ''}</li>`).join('')}</ol>` : '';
  const url = `${BASE}events/${slug(e.id)}/`;
  let loc = '<p class="muted">Not placed on the plate: the entry concerns several countries.</p>';
  if (e.lat != null) {
    const [x, y] = locate(e.lon, e.lat);
    loc = `<figure class="locator"><div class="lmap"><img src="../../assets/img/locator.svg" width="${LOC.w}" height="${LOC.h}" alt="World map marking the position of the event">` +
      `<svg viewBox="0 0 ${LOC.w} ${LOC.h}" aria-hidden="true"><g stroke="#b3261e" stroke-width="0.9" fill="none"><circle cx="${x}" cy="${y}" r="5"/><path d="M${x - 11},${y}h7M${x + 4},${y}h7M${x},${y - 11}v7M${x},${y + 4}v7"/></g></svg></div>` +
      `<figcaption>${fmtCoord(e.lat, e.lon)}${e.precision === 'approximate' ? ', approximate' : e.precision === 'area' ? ', center of the area concerned' : ''}</figcaption></figure>`;
  }
  const body = `${runhead('../../')}
<main id="main">
<article class="record">
  <div class="rec-head"><p class="rec-code">${slug(e.id)}</p><h1>${esc(e.title)}</h1></div>
  <dl class="fields">
    ${row('Date', p(e.dates))}${row('Place', p(e.place))}${row('Service', p(e.services.join(', ')))}${row('Context', p(e.context))}
    ${row('Classification', `<p>${shapeSVG(e)} ${TYPE_LABEL[e.case_type]}${e.scope === 'adjacent' ? ', adjacent case' : ''}. ${TDEF[e.case_type][0].toUpperCase() + TDEF[e.case_type].slice(1)}.</p>`)}
    ${row('Summary', p(e.summary))}${row('Holders of the record', holdersHTML(e.records))}${row('Why the records stayed apart', p(e.gap))}${row('Joined by', p(e.joining))}
    ${row('Harm found later', p(e.harm))}${row('Sources', src)}
    ${row('Verification', e.verification ? `<p class="muted">${esc(e.verification)}</p>` : '')}
    ${row('To cite', `<div class="cite"><p>${esc(cfg.title)}, entry ${e.id}, “${esc(e.title)}.” ${esc(cfg.credit)}. ${esc(url)}</p></div>`)}
  </dl>
  <div class="rec-side">
    ${loc}
    <p class="rec-links">${e.lat != null ? `<a href="../../index.html#${slug(e.id)}">Show on the plate</a>` : ''}<a href="../index.html">The whole register</a></p>
  </div>
</article>
<nav class="pn" aria-label="Neighbouring entries">${prev ? `<a href="../${slug(prev.id)}/index.html">${prev.id.toLowerCase()}  ${esc(prev.label)}</a>` : '<span></span>'}${next ? `<a href="../${slug(next.id)}/index.html">${esc(next.label)}  ${next.id.toLowerCase()}</a>` : ''}</nav>
</main>`;
  return page({ title: `${e.id} ${e.title} · ${cfg.title}`, rel: '../../', body, desc: e.summary.slice(0, 200), current: 'register' });
}

function aboutPage(events) {
  const counts = CASE_TYPES.map(t => `${events.filter(e => e.case_type === t).length} ${t}`).join(', ');
  const body = `${runhead('')}
<main id="main" class="text">
  <h1>About the atlas</h1>
  <p class="lede">The atlas maps disruptions of civilian services since 1945 in which operators, regulators, insurers, health authorities, police and intelligence agencies each recorded one part of what happened, for their own purposes and under their own rules.</p>
  <h2>The aggregation gap</h2>
  <p>All of these records may be accurate and still leave unclear what happened, because joining them, and deciding that an event was an attack, lies outside the purpose for which each was kept. An aggregation gap opens where institutions hold observations that could support a more extensive interpretation but lack the means or the authority to take them together. It widens as recorders become more numerous and smaller, as each applies its own threshold, and as no institution with authority to join the records receives them. It narrows when the attacker makes the act public or strikes a single target.</p>
  <h2>Classification of entries</h2>
  <dl class="types">${CASE_TYPES.map(t => `<dt>${shapeSVG({ case_type: t })}${TYPE_LABEL[t]}</dt><dd>${TYPE_TEXT[t]}</dd>`).join('')}<dt>${shapeSVG({ scope: 'adjacent' })}Adjacent</dt><dd>The target was a commercial or defense site whose records stayed apart in the same way as those of a civilian service. The square takes the ink of its class.</dd></dl>
  <p>The register now holds ${events.length} entries (${counts}).</p>
  <h2>How the entries are made</h2>
  <p>Each entry was drafted from published sources. A second, independent pass then checked it against those sources and corrected or removed any claim they did not support. The verification line on each entry gives the result. Where an entry is only partly verified, the line names what remains open.</p>
  <p><i>Nota.</i> ${esc(NOTA)}</p>
  <h2>How the plate is drawn</h2>
  <p>The plate borrows its drawing from atlas sheets now in the public domain. The water lining along the coasts comes from S. Augustus Mitchell’s <i>Europe</i> (1849), and the graduated border with its degree figures from Keith Johnston’s <i>General Atlas</i> (1861) and Stieler’s <i>Hand-Atlas</i> (1891). Red marks the selected entry, as red marks the present boundary on the 1961 Algeria–Libya map prepared for the State Department’s Office of the Geographer. Under the plate, the scale of years stacks one bar for each entry, much as John Snow stacked one bar for each death on his cholera map of 1855. The boundaries are those of the period selected, as they stood on the date given in the reference box.</p>
  <h2 id="suggest">Suggest an event</h2>
  <p>Suggestions are reviewed by the editors before anything is published.</p>
  ${suggestBlock()}
  <h2 id="subscribe">Notices by email</h2>
  ${subscribeBlock('')}
  <h2>Credits and licences</h2>
  <p>${esc(cfg.credit)}. Prepared for the edited volume <i>${esc(cfg.volume)}</i>. Coastlines: Natural Earth, public domain, via world-atlas. Boundaries: CShapes 2.0, Schvitz, Guy, Seraina Rüegger, Luc Girardin, Lars-Erik Cederman, Nils Weidmann and Kristian Skrede Gleditsch, “Mapping the International System, 1886–2017: The CShapes 2.0 Dataset,” <i>Journal of Conflict Resolution</i> 66, no. 1 (2022): 144–61, licensed CC BY-NC-SA 4.0. Type: Libre Caslon Text and Libre Franklin, SIL Open Font License. Drawing: d3 and topojson.</p>
</main>`;
  return page({ title: `About · ${cfg.title}`, rel: '', body, current: 'about' });
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

fs.rmSync(OUT, { recursive: true, force: true });
const write = (p, s) => { const f = path.join(OUT, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const copyDir = (src, dst) => fs.cpSync(path.join(ROOT, src), path.join(OUT, dst), { recursive: true });

copyDir('assets', 'assets');
write('index.html', indexPage(shown));
write('about.html', aboutPage(shown));
write('events/index.html', eventsIndexPage(shown));
shown.forEach((e, i) => write(`events/${slug(e.id)}/index.html`, eventPage(e, shown[i - 1], shown[i + 1])));
write('feed.xml', feed(shown));
// what the plate and its record need
write('data/events.json', JSON.stringify(shown.map(e => ({
  id: e.id, n: e.n, label: e.label, title: e.title, dates: e.dates, year: e.year, decade: e.decade, place: e.place,
  lat: e.lat, lon: e.lon, more: e.more, precision: e.precision, case_type: e.case_type, scope: e.scope, context: e.context, services: e.services,
  strength: e.strength, summary: e.summary, records: e.records, gap: e.gap, joining: e.joining, harm: e.harm,
  sources: e.sources, verification: e.verification, verified: /^verified/i.test(e.verification), url: `events/${slug(e.id)}/index.html`,
}))));
write('data/events.csv', toCSV(events.map(e => ({
  ...e, more_sites: e.more.map(p => p.join(', ')).join('; '), services: e.services.join(', '),
  harm_found_later: e.harm, sources: e.sources.map(s => `${s.cite} | ${s.url}`).join('\n'),
})), PUBLIC_COLS));
const root = BASE.replace(/^https?:\/\/[^/]+/, '');
write('404.html', page({ title: `Not found · ${cfg.title}`, rel: root, body: `${runhead(root)}<main id="main" class="text"><h1>Not found</h1><p>The page may have moved. Start from the <a href="${root}index.html">plate</a> or the <a href="${root}events/index.html">register</a>.</p></main>` }));
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['', 'about.html', 'events/'].concat(events.map(e => `events/${slug(e.id)}/`)).map(u => `<url><loc>${esc(BASE + u)}</loc></url>`).join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${BASE}sitemap.xml\n`);
write('.nojekyll', '');

console.log(`Built ${events.length} published events (${raw.length} rows read) into _site/`);
if (warnings.length) console.log(`${warnings.length} warning(s); see above.`);
