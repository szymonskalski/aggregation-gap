// The figures added under each entry: the chronology of the record (a strip on a time axis and a table)
// and the detail map drawn by tools/detail_maps.mjs. Both are written into the entry page at build time;
// the plate's record panel takes them from the entry page.
import fs from 'node:fs';
import path from 'node:path';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const DAY = 86400000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = MONTHS.map(m => m.slice(0, 3));
export const KINDS = ['event', 'recorded', 'reported', 'finding', 'attributed', 'denied', 'joined', 'other'];
const KIND_WORD = {
  event: 'the event', recorded: 'recorded', reported: 'reported or made public', finding: 'finding or inquiry result',
  attributed: 'attribution', denied: 'denial or dispute', joined: 'records joined', other: 'other dated step',
};
export const CHRONO_COLS = ['id', 'seq', 'date', 'date_end', 'date_text', 'approx', 'holder', 'kind', 'note', 'field'];

// ---------- dates ----------
function parseD(s) {
  const m = String(s ?? '').trim().match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
  return m ? { y: +m[1], m: m[2] ? +m[2] : null, d: m[3] ? +m[3] : null } : null;
}
function period(p) {
  if (p.d) { const t = Date.UTC(p.y, p.m - 1, p.d); return [t, t]; }
  if (p.m) return [Date.UTC(p.y, p.m - 1, 1), Date.UTC(p.y, p.m, 1) - DAY];
  return [Date.UTC(p.y, 0, 1), Date.UTC(p.y + 1, 0, 1) - DAY];
}
// a month or year the entry narrows with early, mid or late, or a season, is drawn over that part only
function refine([a, b], text, p) {
  if (a === b) return [a, b];
  const t = String(text).toLowerCase(), L = b - a;
  if (!p.m) {
    const season = [[/\bspring\b/, 2, 5], [/\bsummer\b/, 5, 8], [/\b(autumn|fall)\b/, 8, 11]].find(([re]) => re.test(t));
    if (season) return [Date.UTC(p.y, season[1], 1), Date.UTC(p.y, season[2], 1) - DAY];
  }
  if (/\b(early|beginning of|start of)\b/.test(t)) return [a, a + L / 3];
  if (/\bmid(-|\s|dle\b)/.test(t)) return [a + L / 3, a + 2 * L / 3];
  if (/\b(late|end of)\b/.test(t)) return [a + 2 * L / 3, b];
  return [a, b];
}
const fmtP = p => (p.d ? `${p.d} ${MONTHS[p.m - 1]} ${p.y}` : p.m ? `${MONTHS[p.m - 1]} ${p.y}` : String(p.y));
function fmtSpan(p, q) {
  if (!q) return fmtP(p);
  if (!p.m && !q.m) return `${p.y}–${q.y}`;
  if (p.y === q.y && p.m && q.m && p.m === q.m && p.d && q.d) return `${p.d}–${q.d} ${MONTHS[p.m - 1]} ${p.y}`;
  if (p.y === q.y && p.m && q.m) return `${p.d ? p.d + ' ' : ''}${MONTHS[p.m - 1]} to ${q.d ? q.d + ' ' : ''}${MONTHS[q.m - 1]} ${p.y}`;
  return `${fmtP(p)} to ${fmtP(q)}`;
}
const HEDGE = /^(on or about|on or before|about|around|approximately|roughly|by|before|after|until|early|mid|late|the end of|the beginning of|spring|summer|autumn|fall|winter)\b/i;
// the date as the table shows it: the entry's own words when they name the year; else the full date,
// with the entry's hedge kept ("by 27 April 2022") or "about" for a date counted from a hedged one
function displayDate(r) {
  const t = String(r.date_text || '').trim();
  let s;
  if (/\b(1[89]|20)\d\d\b/.test(t) && t.length <= 34) s = t.replace(/^(on(?! or)|in|from|during|between)\s+/i, '');
  else {
    s = fmtSpan(r.p, r.q);
    const h = t.replace(/^(on|in)\s+/i, '').match(HEDGE);
    if (h && !/^(early|mid|late|the end of|the beginning of|spring|summer|autumn|fall|winter)$/i.test(h[1]) && !r.q) s = `${h[1].toLowerCase()} ${s}`;
    else if (r.approx && !h) s = `about ${s}`;
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- loading ----------
// rows from the sheet's Chronology tab (or the seed CSV), grouped by entry and put in date order
export function groupChronology(rows, ids, warn) {
  const by = {};
  rows.forEach((r, i) => {
    const id = String(r.id || '').trim().toUpperCase();
    if (!id) return;
    if (!ids.has(id)) { warn(`Chronology row for ${id}, which is not a published entry; left out`); return; }
    const p = parseD(r.date);
    if (!p) { warn(`${id}: chronology date "${r.date}" is not YYYY, YYYY-MM or YYYY-MM-DD; row left out`); return; }
    const q = r.date_end ? parseD(r.date_end) : null;
    if (r.date_end && !q) warn(`${id}: chronology date_end "${r.date_end}" is malformed; ignored`);
    let kind = String(r.kind || '').trim().toLowerCase();
    if (!KINDS.includes(kind)) { warn(`${id}: chronology kind "${r.kind}" unknown; shown as "other"`); kind = 'other'; }
    const approx = /^(true|yes|y|1|x)$/i.test(String(r.approx || '').trim());
    let [a, b] = refine(period(p), r.date_text, p);
    if (q) b = Math.max(b, period(q)[1]);
    let holder = String(r.holder || '').trim();
    holder = holder.charAt(0).toUpperCase() + holder.slice(1);
    const row = { p, q, a, b, approx, kind, holder: kind === 'event' || /^event$/i.test(holder) ? '' : holder, note: String(r.note || '').trim(), date_text: r.date_text || '', seq: parseFloat(r.seq) || i };
    // the event, and anything given as a span, sorts by its start; a later record known only to the month or
    // year sorts by the end of that period, since a record of an act comes after the act
    row.key = row.kind === 'event' || q || a === b ? a : b;
    row.x = q ? a : (a + b) / 2;
    row.shown = displayDate(row);
    (by[id] = by[id] || []).push(row);
  });
  for (const id in by) by[id].sort((r, s) => r.key - s.key || r.seq - s.seq);
  return by;
}

// ---------- the strip ----------
export function mark(kind, ink) {
  const R = '#a8261c', K = '#2b2118';
  const body = {
    event: `<circle r="4.6" fill="${R}"/>`,
    recorded: `<circle r="3.9" fill="#f7efdb" stroke="${K}" stroke-width="1.3"/>`,
    reported: `<circle r="4" fill="${K}"/>`,
    finding: `<rect x="-3.7" y="-3.7" width="7.4" height="7.4" fill="${K}"/>`,
    attributed: `<path d="M0,-4.9L4.4,3.4H-4.4Z" fill="${K}"/>`,
    denied: `<path d="M-3.6,-3.6L3.6,3.6M-3.6,3.6L3.6,-3.6" stroke="${K}" stroke-width="1.7" fill="none"/>`,
    joined: `<circle r="5.4" fill="#f7efdb" stroke="${ink}" stroke-width="1.4"/><circle r="2.3" fill="${ink}"/>`,
    other: `<path d="M0,-4.4L4.4,0L0,4.4L-4.4,0Z" fill="#f7efdb" stroke="${K}" stroke-width="1.2"/>`,
    // a move offered in the exercises that no holder's record shows: waiting for more
    waited: `<circle r="3.9" fill="none" stroke="${K}" stroke-width="1.1" stroke-dasharray="1.6 1.4"/>`,
  }[kind];
  return `<svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true">${body}</svg>`;
}
function ticks(a, b) {
  const span = (b - a) / DAY, out = [];
  const y0 = new Date(a).getUTCFullYear(), y1 = new Date(b).getUTCFullYear();
  if (span > 1500) {
    const yrs = span / 365.25, step = yrs > 40 ? 10 : yrs > 16 ? 5 : yrs > 7 ? 2 : 1;
    for (let y = Math.ceil(y0 / step) * step; y <= y1 + 1; y += step) { const t = Date.UTC(y, 0, 1); if (t >= a && t <= b) out.push([t, String(y)]); }
  } else if (span > 50) {
    // a year is named at January; other ticks name the month, with the year at the first tick
    const step = span > 900 ? 6 : span > 300 ? 3 : span > 150 ? 2 : 1;
    for (let y = y0; y <= y1; y++) for (let m = 0; m < 12; m += step) {
      const t = Date.UTC(y, m, 1);
      if (t >= a && t <= b) out.push([t, m === 0 ? String(y) : !out.length ? `${MON[m]} ${y}` : MON[m]]);
    }
  } else {
    const step = span > 24 ? 7 : span > 10 ? 3 : span > 4 ? 1 : 1;
    let first = true;
    for (let t = Date.UTC(new Date(a).getUTCFullYear(), new Date(a).getUTCMonth(), new Date(a).getUTCDate()); t <= b; t += step * DAY) {
      if (t < a) continue;
      const d = new Date(t);
      out.push([t, first || d.getUTCDate() <= step ? `${d.getUTCDate()} ${MON[d.getUTCMonth()]}${first ? ' ' + d.getUTCFullYear() : ''}` : String(d.getUTCDate())]);
      first = false;
    }
  }
  return out;
}
function lagText(rows) {
  const ev = rows.find(r => r.kind === 'event'), jo = rows.find(r => r.kind === 'joined');
  if (!ev || !jo) return '';
  const d = (jo.x - ev.a) / DAY;
  if (d < 0) return '';
  const rough = ev.approx || jo.approx || ev.a !== ev.b || jo.a !== jo.b;
  let s;
  if (d < 1) s = 'the same day';
  else if (d < 61) s = `${Math.round(d)} day${Math.round(d) === 1 ? '' : 's'}`;
  else if (d < 730) s = `${Math.round(d / 30.44)} months`;
  else s = `${Math.round(d / 365.25)} years`;
  return d < 1 ? `Event to first joining of the records: the same day` : `Event to first joining of the records: ${rough ? 'about ' : ''}${s}`;
}

export function chronoHTML(e, rows, ink) {
  if (!rows || !rows.length) return '';
  let a = Math.min(...rows.map(r => r.a)), b = Math.max(...rows.map(r => r.b));
  if (b - a < 2 * DAY) { a -= 2 * DAY; b += 2 * DAY; }
  const pad = (b - a) * 0.035;
  a -= pad; b += pad;
  const X = t => (((t - a) / (b - a)) * 100).toFixed(2);
  // one line for the event, then one for each holder in the order it first appears
  const lanes = [];
  const laneOf = r => { const k = r.holder ? r.holder.toLowerCase() : ''; let l = lanes.find(x => x.k === k); if (!l) { l = { k, name: r.holder || 'The event', rows: [] }; lanes.push(l); } return l; };
  if (rows.some(r => !r.holder)) laneOf({ holder: '' });
  rows.forEach(r => laneOf(r).rows.push(r));
  const tip = r => `${r.shown}. ${r.holder ? r.holder + ': ' : ''}${r.note}`;
  const lanesHTML = lanes.map(l => {
    let lastX = -9, lift = 0;
    const marks = [...l.rows].sort((r, s) => r.x - s.x).map(r => {
      const x = +X(r.x);
      lift = x - lastX < 1.6 ? (lift === 0 ? 1 : lift === 1 ? -1 : 0) : 0;
      lastX = x;
      const bar = r.a !== r.b ? `<span class="ch-bar${r.approx ? ' ch-approx' : ''}" style="left:${X(r.a)}%;width:${Math.max(0.4, X(r.b) - X(r.a)).toFixed(2)}%"></span>` : '';
      return `${bar}<span class="ch-mk${lift ? (lift > 0 ? ' up' : ' dn') : ''}" style="left:${x}%" data-tip="${esc(tip(r))}">${mark(r.kind, ink)}</span>`;
    }).join('');
    return `<div class="ch-lane${l.k ? '' : ' ch-ev'}"><div class="ch-who">${esc(l.name)}</div><div class="ch-track">${marks}</div></div>`;
  }).join('');
  const axis = `<div class="ch-axis"><div class="ch-who"></div><div class="ch-track">${ticks(a, b).map(([t, s]) => `<span${+X(t) > 93 ? ' class="r"' : +X(t) < 5 ? ' class="l"' : ''} style="left:${X(t)}%">${esc(s)}</span>`).join('')}</div></div>`;
  const used = KINDS.filter(k => rows.some(r => r.kind === k));
  const key = `<ul class="ch-key">${used.map(k => `<li>${mark(k, ink)}${KIND_WORD[k]}</li>`).join('')}${rows.some(r => r.a !== r.b) ? '<li><span class="ch-keybar"></span>date known to the month or year, or a span</li>' : ''}</ul>`;
  const lag = lagText(rows);
  const table = `<table class="ch-table"><thead><tr><th scope="col">Date</th><th scope="col">Holder</th><th scope="col">What the entry records</th></tr></thead><tbody>${rows.map(r =>
    `<tr><td>${mark(r.kind, ink)}<span class="vh">${KIND_WORD[r.kind]}: </span>${esc(r.shown)}</td><td>${r.holder ? esc(r.holder) : '<i>The event</i>'}</td><td>${esc(r.note)}</td></tr>`).join('')}</tbody></table>`;
  return `<figure class="chrono">
  <h2 class="ex-h">Chronology of the record</h2>
  <div class="ch-strip" aria-hidden="true">${lanesHTML}${axis}</div>
  ${key}${lag ? `<p class="ch-lag">${esc(lag)}</p>` : ''}
  ${table}
  <figcaption>Dated moments taken from the entry’s own text, one line for each holder of the record. Moments the entry does not date are left out.</figcaption>
</figure>`;
}

// ---------- the detail map ----------
export function loadMaps(root) {
  const dir = path.join(root, 'assets', 'maps');
  let manifest = {};
  try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch { return { has: () => false }; }
  return {
    has: id => !!manifest[id] && fs.existsSync(path.join(dir, `${id.toLowerCase()}.svg`)),
    svg: id => fs.readFileSync(path.join(dir, `${id.toLowerCase()}.svg`), 'utf8'),
    meta: id => manifest[id],
  };
}
export function detailMapHTML(e, maps, rel) {
  if (e.lat == null || !maps.has(e.id)) return '';
  const m = maps.meta(e.id) || {};
  const drawn = ['coastlines', 'lakes', 'rivers'].concat(m.rail ? ['railways'] : [], m.roads ? ['main roads'] : [], ['towns']);
  const list = drawn.slice(0, -1).join(', ') + ' and ' + drawn[drawn.length - 1];
  const where = e.precision === 'approximate' ? 'the approximate position of the event' : e.precision === 'area' ? 'the center of the area concerned' : 'the position of the event';
  const more = m.sites > 1 ? `; dashed lines lead to the other sites the entry names` : '';
  return `<figure class="detail">
  <h2 class="ex-h">Detail map</h2>
  <div class="dm">${maps.svg(e.id)}</div>
  <figcaption>The red ring marks ${where}${more}. Boundaries as they stood on ${esc(m.borders || '')}, from CShapes 2.0. ${list[0].toUpperCase() + list.slice(1)} as they are today, from Natural Earth. Azimuthal equal-area projection centered on the site. <a href="${rel}assets/maps/${e.id.toLowerCase()}.svg" download>SVG</a></figcaption>
</figure>`;
}

// ---------- pictures ----------
export const MEDIA_COLS = ['id', 'seq', 'kind', 'site_url', 'source_page', 'source', 'title', 'caption', 'alt', 'author', 'licence', 'licence_url', 'date', 'width', 'height', 'status'];
const HOSTS = /^https:\/\/(upload\.wikimedia\.org|images-assets\.nasa\.gov)\//;
// rows of the Media tab marked published, by entry, at most two each; a picture whose address is not on the
// Commons or NASA servers, or whose licence is not an open one, is left out
export function groupMedia(rows, ids, warn) {
  const by = {};
  rows.forEach((r, i) => {
    const id = String(r.id || '').trim().toUpperCase();
    if (!id || String(r.status || '').trim().toLowerCase() !== 'published') return;
    if (!ids.has(id)) { warn(`Media row for ${id}, which is not a published entry; left out`); return; }
    if (!HOSTS.test(r.site_url || '')) { warn(`${id}: picture address "${r.site_url}" is not on Wikimedia Commons or NASA; left out`); return; }
    if (!/(public domain|cc0|cc by)/i.test(r.licence || '') || /\b(nc|nd)\b/i.test(r.licence || '')) { warn(`${id}: picture licence "${r.licence}" is not an open licence; left out`); return; }
    if (!String(r.caption || '').trim() || !String(r.author || '').trim()) { warn(`${id}: picture without caption or author; left out`); return; }
    (by[id] = by[id] || []).push({ ...r, seq: parseFloat(r.seq) || i, width: parseInt(r.width, 10) || 0, height: parseInt(r.height, 10) || 0 });
  });
  for (const id in by) { by[id].sort((a, b) => a.seq - b.seq); if (by[id].length > 2) { warn(`${id}: more than two pictures; the first two are shown`); by[id] = by[id].slice(0, 2); } }
  return by;
}
const sourceName = m => (/nasa/i.test(m.source_page || '') ? 'NASA' : 'Wikimedia Commons');
// the attribution Commons asks for: author, licence with its link, and the source
export function creditHTML(m) {
  const name = /^public domain/i.test(m.licence) ? 'public domain' : m.licence.replace(/;.*$/, '').trim();
  const lic = m.licence_url ? `<a href="${esc(m.licence_url)}" rel="license noopener">${esc(name)}</a>` : esc(name);
  return `${esc(m.author)}, ${lic}, via <a href="${esc(m.source_page)}" rel="noopener">${sourceName(m)}</a>`;
}
export function picturesHTML(e, imgs) {
  if (!imgs || !imgs.length) return '';
  const one = m => {
    // the site loads a copy at most 960 px wide; the attributes give the size it is shown at, never larger
    const w = Math.min(m.width, 960), dims = m.width && m.height ? ` width="${w}" height="${Math.round(m.height * w / m.width)}"` : '';
    return `<figure class="pic"><a href="${esc(m.source_page)}" rel="noopener"><img src="${esc(m.site_url)}"${dims} alt="${esc(m.alt || m.caption)}" loading="lazy" decoding="async"></a><figcaption><p>${esc(m.caption)}</p><p class="credit">${creditHTML(m)}</p></figcaption></figure>`;
  };
  // where nothing shows the event, the entry shows the place, or the building of an institution that held part of
  // its record, and the heading says which
  const kind = imgs.every(m => m.kind === 'place') ? 'place' : imgs.every(m => m.kind === 'institution') ? 'institution' : '';
  const head = kind === 'place' ? 'The place' : kind === 'institution' ? 'A holder of the record' : imgs.length > 1 ? 'Pictures' : 'Picture';
  return `<figure class="pictures${kind ? ` ${kind}` : ''}">
  <h2 class="ex-h">${head}</h2>
  <div class="pics${imgs.length > 1 ? ' two' : ''}">${imgs.map(one).join('')}</div>
</figure>`;
}
