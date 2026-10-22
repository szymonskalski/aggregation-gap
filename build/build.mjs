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
const PUBLIC_COLS = ['id', 'title', 'label', 'dates', 'year', 'place', 'lat', 'lon', 'more_sites', 'precision', 'case_type', 'scope', 'context', 'services', 'strength', 'summary', 'records', 'gap', 'joining', 'harm_found_later', 'use_in_volume', 'sources', 'verification', 'added'];

const warnings = [];
const warn = m => { warnings.push(m); console.warn('WARN', m); };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = id => id.toLowerCase();
const decadeOf = y => (y < 1960 ? 1945 : Math.floor(y / 10) * 10);
const decadeName = d => (d === 1945 ? '1945–1959' : d === 2020 ? '2020–2026' : `${d}–${d + 9}`);

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
function subscribeBlock(rel) {
  const s = cfg.subscribe || {};
  const rss = `<a href="${rel}feed.xml">RSS feed</a>`;
  if (s.form_action) {
    return `<form class="subscribe" action="${esc(s.form_action)}" method="post" target="_blank" rel="noopener">
      <label for="sub-email">Email updates when new events are added</label>
      <div class="subrow"><input id="sub-email" type="email" name="${esc(s.email_field || 'email')}" required placeholder="name@university.edu" autocomplete="email"><button type="submit">Subscribe</button></div>
      <p class="fine">Sent by ${esc(s.provider_name || 'our newsletter service')}. You can unsubscribe from any email. Or follow the ${rss}.</p>
    </form>`;
  }
  if (s.page_url) return `<div class="subscribe"><p>Email updates when new events are added.</p><a class="button" href="${esc(s.page_url)}" target="_blank" rel="noopener">Subscribe</a><p class="fine">Or follow the ${rss}.</p></div>`;
  return `<div class="subscribe"><p>Email updates will start soon. Until then, follow the ${rss}.</p></div>`;
}
function suggestBlock() {
  if (cfg.suggest_url) return `<a class="button ghost" href="${esc(cfg.suggest_url)}" target="_blank" rel="noopener">Suggest an event</a>`;
  if (cfg.contact_email) return `<p>To suggest an event, write to <span class="sel">${esc(cfg.contact_email)}</span>.</p>`;
  return '';
}
function page({ title, rel, body, desc, cls = '', current = '' }) {
  const nav = [['index.html', 'Map', 'map'], ['events/index.html', 'Events', 'events'], ['about.html', 'About', 'about']]
    .map(([h, t, k]) => `<a href="${rel}${h}"${current === k ? ' aria-current="page"' : ''}>${t}</a>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc || cfg.subtitle)}">
<link rel="stylesheet" href="${rel}assets/css/site.css">
<link rel="alternate" type="application/rss+xml" title="${esc(cfg.title)}: new events" href="${rel}feed.xml">
</head>
<body class="${cls}">
<header class="top">
  <a class="brand" href="${rel}index.html">${esc(cfg.title)}</a>
  <nav>${nav}<a class="navsub" href="${rel}about.html#subscribe">Subscribe</a></nav>
</header>
${body}
<footer class="foot">
  <p>${esc(cfg.credit)}. Prepared for <i>${esc(cfg.volume)}</i>.</p>
  <p><a href="${rel}data/events.csv">Download the data (CSV)</a> · <a href="${rel}data/events.json">JSON</a> · <a href="${rel}feed.xml">RSS</a> · Updated ${new Date().toISOString().slice(0, 10)}</p>
</footer>
</body>
</html>`;
}

function shapeSVG(e, size = 14) {
  const c = size / 2, s = size * 0.3;
  let inner;
  if (e.scope === 'adjacent') inner = `<rect x="${c - s}" y="${c - s}" width="${2 * s}" height="${2 * s}" fill="${e.case_type === 'core' ? '#141414' : '#fff'}" stroke="#141414"/>`;
  else if (e.case_type === 'core') inner = `<circle cx="${c}" cy="${c}" r="${s}" fill="#141414"/>`;
  else if (e.case_type === 'contrast') inner = `<circle cx="${c}" cy="${c}" r="${s}" fill="#fff" stroke="#141414"/>`;
  else if (e.case_type === 'control') inner = `<path d="M${c},${c - s * 1.2}L${c + s * 1.1},${c + s * 0.8}L${c - s * 1.1},${c + s * 0.8}Z" fill="#fff" stroke="#141414"/>`;
  else inner = `<path d="M${c - s},${c - s}L${c + s},${c + s}M${c - s},${c + s}L${c + s},${c - s}" stroke="#141414" stroke-width="1.6"/>`;
  return `<svg class="shape" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">${inner}</svg>`;
}

// ---------- pages ----------
function indexPage(events) {
  const body = `<main class="app">
  <section class="mapcol">
    <div class="intro"><h1>${esc(cfg.title)}</h1><p>${esc(cfg.subtitle)}. Each marker is one event from the casebook; select it to see who held the record, why the parts stayed apart, and who joined them.</p></div>
    <div id="map" class="map" role="region" aria-label="Map of events"><p class="loading">Loading the map…</p></div>
    <div id="timeline" class="timeline" role="group" aria-label="Filter by decade"></div>
    <div class="legend">${CASE_TYPES.map(t => `<span>${shapeSVG({ case_type: t })}${TYPE_LABEL[t]}</span>`).join('')}<span>${shapeSVG({ case_type: 'core', scope: 'adjacent' })}Adjacent case</span><span class="fine">Scroll or pinch to zoom; numbers appear when zoomed in.</span></div>
  </section>
  <aside class="side">
    <div class="filters">
      <input id="q" type="search" placeholder="Search events, places, institutions" aria-label="Search">
      <div class="chips" role="group" aria-label="Case type">${CASE_TYPES.map(t => `<button type="button" class="chip" data-type="${t}" aria-pressed="true">${shapeSVG({ case_type: t }, 12)}${TYPE_LABEL[t]}</button>`).join('')}</div>
      <div class="row">
        <select id="svc" aria-label="Service"><option value="">All services</option>${SERVICES.map(s => `<option value="${s}">${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select>
        <select id="ctx" aria-label="Context"><option value="">All contexts</option>${CONTEXTS.map(s => `<option value="${s}">${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select>
      </div>
      <div class="row toggles"><label><input type="checkbox" id="harm"> Harm found later</label><label><input type="checkbox" id="adj" checked> Adjacent cases</label><label><input type="checkbox" id="vfy"> Fully verified only</label></div>
    </div>
    <div id="detail" class="detail" hidden></div>
    <p id="count" class="count" aria-live="polite"></p>
    <ol id="list" class="list"></ol>
    <noscript><p>The map needs JavaScript. The full list is on the <a href="events/index.html">Events</a> page.</p></noscript>
  </aside>
</main>
<script src="assets/vendor/d3.min.js"></script>
<script src="assets/vendor/topojson-client.min.js"></script>
<script src="assets/js/map.js"></script>`;
  return page({ title: cfg.title, rel: '', body, cls: 'home', current: 'map' });
}

function eventsIndexPage(events) {
  const groups = {};
  events.forEach(e => (groups[e.decade] = groups[e.decade] || []).push(e));
  const body = `<main class="prose wide">
  <h1>All events</h1>
  <p class="lede">${events.length} events, by decade. Each entry has its own page with the full record and sources.</p>
  ${Object.keys(groups).sort().map(d => `<section class="dec"><h2>${decadeName(+d)} <span>${groups[d].length}</span></h2><ul class="evlist">${groups[d].sort((a, b) => a.year - b.year || a.n - b.n).map(e => `<li>${shapeSVG(e, 12)}<a href="${slug(e.id)}/index.html"><span class="no">${e.id}</span> ${esc(e.title)}</a><span class="m">${esc(e.dates)} · ${esc(e.place)}</span></li>`).join('')}</ul></section>`).join('')}
</main>`;
  return page({ title: `All events · ${cfg.title}`, rel: '../', body, current: 'events' });
}

function eventPage(e, prev, next) {
  const sec = (h, t) => (t ? `<section><h2>${h}</h2><p>${esc(t)}</p></section>` : '');
  const src = e.sources.map(s => `<li>${esc(s.cite)}${s.url ? ` <a href="${esc(s.url)}" rel="noopener">${esc(s.url.replace(/^https?:\/\//, '').slice(0, 60))}${s.url.length > 68 ? '…' : ''}</a>` : ''}</li>`).join('');
  const url = `${BASE}events/${slug(e.id)}/`;
  const body = `<main class="prose entry">
  <p class="crumbs"><a href="../index.html">All events</a> · ${decadeName(e.decade)}</p>
  <p class="eid">${e.id}</p>
  <h1>${esc(e.title)}</h1>
  <p class="meta"><span class="type t-${e.case_type}">${shapeSVG(e, 13)}${TYPE_LABEL[e.case_type]}${e.scope === 'adjacent' ? ' · adjacent case' : ''}</span><span>${esc(e.dates)}</span><span>${esc(e.place)}</span><span>${esc(e.services.join(', '))}</span><span>${esc(e.context)}</span></p>
  <p class="lede">${esc(e.summary)}</p>
  ${e.lat != null ? `<p><a class="button ghost" href="../../index.html#${slug(e.id)}">Show on the map</a></p>` : '<p class="fine">This event spans several countries and is not placed on the map.</p>'}
  <div class="cols">
    ${sec('Who held the record', e.records)}${sec('Why it stayed apart', e.gap)}${sec('Who joined it', e.joining)}${sec('Harm found later', e.harm)}${sec('Use in the volume', e.use)}
  </div>
  <section><h2>Sources</h2><ol class="sources">${src}</ol></section>
  <p class="verif">${esc(e.verification)}</p>
  <section class="cite"><h2>How to cite</h2><p class="sel">${esc(cfg.title)}, entry ${e.id}, “${esc(e.title)}.” ${esc(cfg.credit)}. ${esc(url)}</p></section>
  <nav class="pn">${prev ? `<a href="../${slug(prev.id)}/index.html">← ${prev.id}</a>` : '<span></span>'}${next ? `<a href="../${slug(next.id)}/index.html">${next.id} →</a>` : ''}</nav>
</main>`;
  return page({ title: `${e.id} ${e.title} · ${cfg.title}`, rel: '../../', body, desc: e.summary.slice(0, 200), current: 'events' });
}

function aboutPage(events) {
  const counts = CASE_TYPES.map(t => `${events.filter(e => e.case_type === t).length} ${t}`).join(', ');
  const body = `<main class="prose">
  <h1>About the atlas</h1>
  <p class="lede">The atlas maps disruptions of civilian services since 1945 in which operators, regulators, insurers, health authorities, police and intelligence agencies each recorded one part of what happened, for their own purposes and under their own rules.</p>
  <h2>The aggregation gap</h2>
  <p>All of these records may be accurate and still leave unclear what happened, because joining them, and deciding that an event was an attack, lies outside the purpose for which each was kept. An aggregation gap opens where institutions hold observations that could support a more extensive interpretation but lack the means or the authority to take them together. It widens as recorders become more numerous and smaller, as each applies its own threshold, and as no institution with authority to join the records receives them. It narrows when the attacker makes the act public or strikes a single target.</p>
  <h2>Case types</h2>
  <dl class="types">${CASE_TYPES.map(t => `<dt>${shapeSVG({ case_type: t })}${TYPE_LABEL[t]}</dt><dd>${TYPE_TEXT[t]}</dd>`).join('')}<dt>${shapeSVG({ case_type: 'core', scope: 'adjacent' })}Adjacent</dt><dd>The target was a commercial or defense site rather than a civilian service, but the records behaved the same way.</dd></dl>
  <p>The atlas now holds ${events.length} events (${counts}).</p>
  <h2>How the entries are made</h2>
  <p>Each entry was drafted from published sources and then checked against those sources by a second, independent pass, which corrected or removed claims the sources did not support. The verification line on each entry states the result, and partly verified entries name what remains open. The list draws mainly on sources in English that are available online; empty regions and the thin early decades reflect where documentation is accessible as well as where events occurred.</p>
  <h2 id="suggest">Suggest an event</h2>
  <p>Suggestions are reviewed by the editors before anything is published.</p>
  ${suggestBlock()}
  <h2 id="subscribe">Subscribe</h2>
  ${subscribeBlock('')}
  <h2>Credits</h2>
  <p>${esc(cfg.credit)}. Prepared for the edited volume <i>${esc(cfg.volume)}</i>. Base map: Natural Earth, via world-atlas.</p>
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

fs.rmSync(OUT, { recursive: true, force: true });
const write = (p, s) => { const f = path.join(OUT, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const copyDir = (src, dst) => fs.cpSync(path.join(ROOT, src), path.join(OUT, dst), { recursive: true });

copyDir('assets', 'assets');
write('index.html', indexPage(events));
write('about.html', aboutPage(events));
write('events/index.html', eventsIndexPage(events));
events.forEach((e, i) => write(`events/${slug(e.id)}/index.html`, eventPage(e, events[i - 1], events[i + 1])));
write('feed.xml', feed(events));
// map data: what the map and side panel need
write('data/events.json', JSON.stringify(events.map(e => ({
  id: e.id, n: e.n, label: e.label, title: e.title, dates: e.dates, year: e.year, decade: e.decade, place: e.place,
  lat: e.lat, lon: e.lon, more: e.more, case_type: e.case_type, scope: e.scope, context: e.context, services: e.services,
  strength: e.strength, summary: e.summary, gap: e.gap, joining: e.joining, harm: !!e.harm,
  verified: /^verified/i.test(e.verification), url: `events/${slug(e.id)}/index.html`,
}))));
write('data/events.csv', toCSV(events.map(e => ({
  ...e, more_sites: e.more.map(p => p.join(', ')).join('; '), services: e.services.join(', '),
  harm_found_later: e.harm, use_in_volume: e.use, sources: e.sources.map(s => `${s.cite} | ${s.url}`).join('\n'),
})), PUBLIC_COLS));
write('404.html', page({ title: `Not found · ${cfg.title}`, rel: BASE.replace(/^https?:\/\/[^/]+/, ''), body: '<main class="prose"><h1>Page not found</h1><p>The page may have moved. Start from the <a href="index.html">map</a> or the list of <a href="events/index.html">all events</a>.</p></main>' }));
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['', 'about.html', 'events/'].concat(events.map(e => `events/${slug(e.id)}/`)).map(u => `<url><loc>${esc(BASE + u)}</loc></url>`).join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${BASE}sitemap.xml\n`);
write('.nojekyll', '');

console.log(`Built ${events.length} published events (${raw.length} rows read) into _site/`);
if (warnings.length) console.log(`${warnings.length} warning(s); see above.`);
