// Detail maps for the Aggregation Gap Atlas: one regional plate for each entry placed on the map.
// Drawn in the style of the main plate: water-lined coasts, period boundaries, rivers, railways,
// places, a scale bar and degree figures, with the entry's site in the ink of its class and the
// red overprint. Output: assets/maps/ag-xxx.svg and assets/maps/manifest.json (for captions).
//
// Usage (from the repository root, after `npm install --prefix tools`):
//   node tools/detail_maps.mjs data/events.seed.csv <natural-earth-geojson-dir> <CShapes-2.0.geojson> assets/maps
// Natural Earth 10m GeoJSON files: github.com/nvkelso/natural-earth-vector (geojson/ne_10m_*.geojson).
// CShapes 2.0: icr.ethz.ch/data/cshapes (CC BY-NC-SA 4.0).
import fs from 'node:fs';
import path from 'node:path';
import * as d3 from 'd3-geo';
import { topology } from 'topojson-server';
import { mesh } from 'topojson-client';
import { parseCSV } from '../build/csv.mjs';
import { periodName } from './period_names.mjs';

const [, , CSV, NE, CSHAPES, OUT] = process.argv;
const W = 640, H = 440, M = 24;
const X0 = M, Y0 = M, X1 = W - M, Y1 = H - M;
const FONT = "Libre Franklin, 'Franklin Gothic Book', 'Helvetica Neue', Arial, sans-serif";
const SERIF = "'Libre Caslon Text', Georgia, serif";
const INK = { core: '#1f4f8f', contrast: '#00876f', control: '#b07a00', misattribution: '#9a68c4' };
const WASH = { core: '#c7d3e3', contrast: '#bfe1db', control: '#ebdebf', misattribution: '#e6d9f0' };
const RED = '#b3261e';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const range = (a, b, st) => { const o = []; for (let v = a; v <= b; v += st) o.push(v); return o; };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const load = f => JSON.parse(fs.readFileSync(path.join(NE, `ne_10m_${f}.geojson`), 'utf8')).features;
console.log('loading layers');
const withBounds = feats => feats.map(f => ({ f, b: d3.geoBounds(f) }));
const LAND = { type: 'FeatureCollection', features: load('land').concat(load('minor_islands')) };
const LAKES = withBounds(load('lakes'));
const RIVERS = withBounds(load('rivers_lake_centerlines').filter(f => /river/i.test(f.properties.featurecla || '')));
const RAIL = withBounds(load('railroads'));
const ROADS = withBounds(load('roads').filter(f => ['Major Highway', 'Beltway'].includes(f.properties.type)));
const PLACES = load('populated_places').map(f => ({ f, b: d3.geoBounds(f) }));
const CS = JSON.parse(fs.readFileSync(CSHAPES, 'utf8')).features.map(f => ({ f, b: d3.geoBounds(f) }));
console.log('layers loaded');

// does a feature's bounding box meet the map's? (boxes that cross the antimeridian are always kept)
function meets(b, box) {
  if (b[0][0] > b[1][0] || box.wrap) return b[1][1] >= box.s && b[0][1] <= box.n;
  return b[1][0] >= box.w && b[0][0] <= box.e && b[1][1] >= box.s && b[0][1] <= box.n;
}

function shape(ct, scope, s) {
  const c = INK[ct], w = WASH[ct];
  const circ = `M${-s},0a${s},${s} 0 1,0 ${2 * s},0a${s},${s} 0 1,0 ${-2 * s},0Z`;
  if (scope === 'adjacent') return `<path d="M${-s},${-s}h${2 * s}v${2 * s}h${-2 * s}Z" fill="${ct === 'core' ? c : w}" stroke="${c}" stroke-width="1.4"/>`;
  if (ct === 'core') return `<path d="${circ}" fill="${c}" stroke="${c}" stroke-width="1"/>`;
  if (ct === 'contrast') return `<path d="${circ}" fill="${w}" stroke="${c}" stroke-width="1.6"/>`;
  if (ct === 'control') return `<path d="M0,${-s * 1.3}L${s * 1.18},${s * 0.82}L${-s * 1.18},${s * 0.82}Z" fill="${w}" stroke="${c}" stroke-width="1.6"/>`;
  return `<path d="M${-s},${-s}L${s},${s}M${-s},${s}L${s},${-s}" stroke="${c}" stroke-width="2.2"/>`;
}

const fmtDeg = (v, pos, neg, step) => {
  const a = Math.abs(v), d = Math.floor(a + 1e-9), m = Math.round((a - d) * 60);
  return (step < 1 && m ? `${d}°${String(m).padStart(2, '0')}′` : `${Math.round(a)}°`) + (Math.abs(v) < 1e-9 ? '' : ' ' + (v > 0 ? pos : neg));
};

// drop points closer than tol px to the last kept one, and rings smaller than a pixel: the 10m data
// carries far more detail than a 640 px map can show once the extent spans many degrees
function thin(d, tol = 0.6, minRing = 1.2) {
  if (!d) return '';
  return d.replace(/M([^MZ]+)(Z?)/g, (all, body, z) => {
    const pts = body.split('L').map(q => q.split(',').map(Number));
    if (pts.some(q => q.length !== 2 || !q.every(Number.isFinite))) return all;
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = pts[i], [px, py] = out[out.length - 1];
      if (Math.abs(x - px) + Math.abs(y - py) >= tol || (i === pts.length - 1 && (x !== px || y !== py))) out.push(pts[i]);
    }
    if (z) {
      const xs = out.map(q => q[0]), ys = out.map(q => q[1]);
      if (out.length < 3 || Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys) < minRing) return '';
    } else if (out.length < 2) return '';
    return 'M' + out.map(q => q.join(',')).join('L') + z;
  });
}

function draw(e) {
  const lat = +e.lat, lon = +e.lon;
  const more = (e.more_sites || '').split(';').map(p => p.split(',').map(Number)).filter(p => p.length === 2 && p.every(Number.isFinite));
  const pts = [[lon, lat]].concat(more.map(p => [p[1], p[0]]));
  const km = e.precision === 'site' ? 40 : e.precision === 'approximate' ? 90 : e.precision === 'area' ? 200 : 70;
  const circles = pts.map(p => d3.geoCircle().center(p).radius(km / 111.2)());
  const fc = { type: 'FeatureCollection', features: circles.map(g => ({ type: 'Feature', geometry: g })) };
  const center = d3.geoCentroid({ type: 'MultiPoint', coordinates: pts });
  const proj = d3.geoAzimuthalEqualArea().rotate([-center[0], -center[1]]).fitExtent([[X0 + 8, Y0 + 8], [X1 - 8, Y1 - 8]], fc);
  // widen to the frame's aspect so the map fills it
  proj.clipExtent([[X0, Y0], [X1, Y1]]);
  const inv = (x, y) => proj.invert([x, y]);
  const corners = [inv(X0, Y0), inv(X1, Y0), inv(X0, Y1), inv(X1, Y1), inv((X0 + X1) / 2, Y0), inv((X0 + X1) / 2, Y1), inv(X0, (Y0 + Y1) / 2), inv(X1, (Y0 + Y1) / 2)];
  const lats = corners.map(c => c[1]), lons = corners.map(c => c[0]);
  const box = { s: Math.min(...lats) - 0.5, n: Math.max(...lats) + 0.5, w: Math.min(...lons) - 0.5, e: Math.max(...lons) + 0.5 };
  box.wrap = box.e - box.w > 180 || Math.max(...lats) > 80;
  const span = Math.max(box.e - box.w, box.n - box.s);
  const path0 = d3.geoPath(proj).digits(1);
  const tol = span > 16 ? 1.5 : span > 7 ? 1 : 0.6;
  // islets smaller than a few pixels would come out as rings of water lining with nothing inside
  const minRing = span > 16 ? 6 : span > 7 ? 3 : 1.2;
  const path = g => thin(path0(g), tol, minRing);
  const P = (feats) => path({ type: 'FeatureCollection', features: feats.filter(x => meets(x.b, box)).map(x => x.f) }) || '';
  const year = +e.year;
  const parts = [];
  const u = e.id.toLowerCase().replace(/[^a-z0-9]/g, '');
  // water lining
  const land = path(LAND) || '';
  const RINGS = [[1.6, '#6e6e6e'], [3.4, '#878787'], [5.6, '#a0a0a0'], [8.2, '#b8b8b8'], [11.2, '#cfcfcf']];
  parts.push(`<defs><clipPath id="${u}-frame"><rect x="${X0}" y="${Y0}" width="${X1 - X0}" height="${Y1 - Y0}"/></clipPath><path id="${u}-land" d="${land}"/>`);
  const lakes = P(LAKES);
  if (lakes) parts.push(`<path id="${u}-lakes" d="${lakes}"/><clipPath id="${u}-lakeclip"><use href="#${u}-lakes"/></clipPath>`);
  parts.push(`</defs><g clip-path="url(#${u}-frame)">`+'<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fff"/>');
  for (let i = RINGS.length - 1; i >= 0; i--) {
    const [d, c] = RINGS[i];
    parts.push(`<use href="#${u}-land" fill="none" stroke="${c}" stroke-width="${(2 * d + 0.5).toFixed(1)}" stroke-linejoin="round"/><use href="#${u}-land" fill="none" stroke="#fff" stroke-width="${(2 * d - 0.5).toFixed(1)}" stroke-linejoin="round"/>`);
  }
  const step = span > 40 ? 10 : span > 16 ? 5 : span > 7 ? 2 : span > 3 ? 1 : 0.5;
  const grat = d3.geoGraticule().step([step, step]).extentMajor([[-180, -89.999], [180, 89.999]]);
  parts.push(`<path d="${path(grat())}" fill="none" stroke="#dcdcdc" stroke-width="0.5"/>`);
  parts.push(`<use href="#${u}-land" fill="#fff" stroke="#121212" stroke-width="0.9" stroke-linejoin="round"/>`);
  if (lakes) {
    parts.push(`<g clip-path="url(#${u}-lakeclip)">`);
    for (const [d, c] of RINGS.slice(0, 3).reverse()) parts.push(`<use href="#${u}-lakes" fill="none" stroke="${c}" stroke-width="${(2 * d + 0.5).toFixed(1)}"/><use href="#${u}-lakes" fill="none" stroke="#fff" stroke-width="${(2 * d - 0.5).toFixed(1)}"/>`);
    parts.push(`</g><use href="#${u}-lakes" fill="none" stroke="#121212" stroke-width="0.6"/>`);
  }
  const riverRank = span > 16 ? 5 : span > 7 ? 7 : 99;
  const rivers = P(RIVERS.filter(x => (x.f.properties.scalerank ?? 0) <= riverRank));
  if (rivers) parts.push(`<path d="${rivers}" fill="none" stroke="#6b6b6b" stroke-width="0.7" stroke-linejoin="round" stroke-linecap="round"/>`);
  const showRoads = year >= 1975 && span < 9;
  const roadRank = span < 2.5 ? 10 : span < 5 ? 6 : 4;
  const roads = showRoads ? P(ROADS.filter(x => (x.f.properties.scalerank || 10) <= roadRank)) : '';
  if (roads) parts.push(`<path d="${roads}" fill="none" stroke="#a8a8a8" stroke-width="0.7"/>`);
  const railRank = span < 2 ? 10 : span < 4 ? 8 : span < 8 ? 6 : span < 14 ? 5 : 0;
  const rail = railRank ? P(RAIL.filter(x => (x.f.properties.scalerank || 10) <= railRank)) : '';
  if (rail) parts.push(`<path d="${rail}" fill="none" stroke="#121212" stroke-width="1.5"/><path d="${rail}" fill="none" stroke="#fff" stroke-width="0.7" stroke-dasharray="3.5 3.5"/>`);
  // boundaries of the period
  const by = Math.min(Math.max(year, 1946), 2019);
  const k = by === 2019 ? 20191230 : by * 10000 + 701;
  const units = CS.filter(x => {
    const p = x.f.properties;
    return p.gwsyear * 10000 + p.gwsmonth * 100 + p.gwsday <= k && k <= p.gweyear * 10000 + p.gwemonth * 100 + p.gweday && meets(x.b, { ...box, s: box.s - 3, n: box.n + 3, w: box.w - 3, e: box.e + 3 });
  });
  let borderDate = by === 2019 ? '30 December 2019' : `1 July ${by}`;
  if (units.length > 1) {
    const t = topology({ c: { type: 'FeatureCollection', features: units.map(x => x.f) } }, 1e5);
    const m = mesh(t, t.objects.c, (a, b) => a !== b);
    parts.push(`<path d="${path(m)}" fill="none" stroke="#4a4a4a" stroke-width="0.9" stroke-dasharray="5 2 1.2 2"/>`);
  }
  // country names of the period
  const labels = [];
  const fix = poly => (d3.geoArea(poly) > 2 * Math.PI ? { type: 'Polygon', coordinates: poly.coordinates.map(r => r.slice().reverse()) } : poly);
  // the largest units first; a name is left out where it would overlap another, or run far beyond
  // its own country on a map of a wide area
  const boxes = [[X0, Y1 - 40, X0 + 150, Y1]].concat(pts.map(p => proj(p)).filter(Boolean).map(([x, y]) => [x - 14, y - 14, x + 14, y + 14]));
  const overlaps = r => boxes.some(t => r[0] < t[2] && r[2] > t[0] && r[1] < t[3] && r[3] > t[1]);
  for (const x of [...units].sort((a, b) => (b.f.properties.area || 0) - (a.f.properties.area || 0))) {
    const g = x.f.geometry;
    const polys = (g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]).map(c => fix({ type: 'Polygon', coordinates: c }));
    const big = polys.sort((a, b) => d3.geoArea(b) - d3.geoArea(a))[0];
    const c = proj(d3.geoCentroid(big));
    const t = periodName(x.f.properties.cntry_name, year);
    const half = t.length * 3.9 + 6;
    if (!c || !(c[0] - half > X0 + 4 && c[0] + half < X1 - 4 && c[1] > Y0 + 20 && c[1] < Y1 - 30)) continue;
    const [[bx0], [bx1]] = path0.bounds(big);
    if (span > 7 && bx1 - bx0 < half * 1.4) continue;
    const r = [c[0] - half, c[1] - 10, c[0] + half, c[1] + 4];
    if (overlaps(r)) continue;
    boxes.push(r);
    labels.push({ x: c[0], y: c[1], t });
  }
  // places: the largest first, kept clear of each other and of the sites
  const sitePx = pts.map(p => proj(p)).filter(Boolean);
  const taken = [[X0, Y1 - 40, X0 + 150, Y1]].concat(sitePx.map(([x, y]) => [x - 14, y - 14, x + 14, y + 14])).concat(labels.map(l => [l.x - l.t.length * 3.6, l.y - 8, l.x + l.t.length * 3.6, l.y + 4]));
  const hit = r => taken.some(t => r[0] < t[2] && r[2] > t[0] && r[1] < t[3] && r[3] > t[1]);
  const places = PLACES.filter(x => meets(x.b, box)).map(x => ({ p: x.f.properties, xy: proj(x.f.geometry.coordinates) }))
    .filter(x => x.xy && x.xy[0] > X0 + 4 && x.xy[0] < X1 - 4 && x.xy[1] > Y0 + 4 && x.xy[1] < Y1 - 4)
    .sort((a, b) => a.p.SCALERANK - b.p.SCALERANK || b.p.POP_MAX - a.p.POP_MAX);
  const placeMarks = [];
  for (const { p, xy } of places) {
    if (placeMarks.length >= 12) break;
    const name = p.NAME, w = name.length * 5.1 + 4;
    const right = xy[0] + w + 6 < X1 - 4;
    const r = right ? [xy[0] + 3, xy[1] - 9, xy[0] + w + 6, xy[1] + 3] : [xy[0] - w - 6, xy[1] - 9, xy[0] - 3, xy[1] + 3];
    if (hit(r) || hit([xy[0] - 3, xy[1] - 3, xy[0] + 3, xy[1] + 3])) continue;
    taken.push(r);
    const cap = /Admin-0 capital/.test(p.FEATURECLA || '');
    placeMarks.push((cap ? `<rect x="${(xy[0] - 2.2).toFixed(1)}" y="${(xy[1] - 2.2).toFixed(1)}" width="4.4" height="4.4" fill="#121212"/>` : `<circle cx="${xy[0].toFixed(1)}" cy="${xy[1].toFixed(1)}" r="1.9" fill="#121212"/>`) +
      `<text x="${(right ? xy[0] + 5 : xy[0] - 5).toFixed(1)}" y="${(xy[1] + 3.2).toFixed(1)}" text-anchor="${right ? 'start' : 'end'}" font-size="9.5" fill="#121212" stroke="#fff" stroke-width="2.6" paint-order="stroke" stroke-linejoin="round">${esc(name)}</text>`);
  }
  parts.push(`<g font-family="${FONT}">` + labels.map(l => `<text x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}" text-anchor="middle" font-size="8.6" letter-spacing="1.6" fill="#7b7b7b" stroke="#fff" stroke-width="2.4" paint-order="stroke">${esc(l.t)}</text>`).join('') + placeMarks.join('') + '</g>');
  // the sites
  const [mx, my] = proj([lon, lat]);
  for (const [px, py] of sitePx.slice(1)) parts.push(`<line x1="${mx.toFixed(1)}" y1="${my.toFixed(1)}" x2="${px.toFixed(1)}" y2="${py.toFixed(1)}" stroke="${RED}" stroke-width="1" stroke-dasharray="4 2.5"/><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.5" fill="#fff" stroke="${RED}" stroke-width="1.3"/>`);
  parts.push(`<g transform="translate(${mx.toFixed(1)},${my.toFixed(1)})"><circle r="11" fill="none" stroke="${RED}" stroke-width="1.6"/><circle r="6.6" fill="#fff"/>${shape(e.case_type, e.scope, 4.6)}</g>`);
  parts.push('</g>');
  // frame, degree figures, scale bar
  parts.push(`<rect x="${X0 - 4}" y="${Y0 - 4}" width="${X1 - X0 + 8}" height="${Y1 - Y0 + 8}" fill="none" stroke="#121212" stroke-width="1.3"/><rect x="${X0}" y="${Y0}" width="${X1 - X0}" height="${Y1 - Y0}" fill="none" stroke="#121212" stroke-width="0.5"/>`);
  const ticks = [];
  const crossings = (lineCoords, test) => {
    const out = [];
    for (let i = 1; i < lineCoords.length; i++) {
      const a = proj(lineCoords[i - 1]), b = proj(lineCoords[i]);
      if (!a || !b) continue;
      const r = test(a, b);
      if (r != null) out.push(r);
    }
    return out;
  };
  const lo0 = Math.floor(box.w / step) * step, lo1 = Math.ceil(box.e / step) * step, la0 = Math.floor(box.s / step) * step, la1 = Math.ceil(box.n / step) * step;
  if (!box.wrap) {
    for (let v = lo0; v <= lo1 + 1e-9; v += step) {
      const line = range(Math.max(la0 - step, -89), Math.min(la1 + step, 89) + 1e-9, step / 40).map(y => [v, y]);
      for (const [yy, anchor] of [[Y0, 'top'], [Y1, 'bottom']]) {
        for (const x of crossings(line, (a, b) => ((a[1] - yy) * (b[1] - yy) <= 0 && a[1] !== b[1] ? a[0] + (b[0] - a[0]) * (yy - a[1]) / (b[1] - a[1]) : null)))
          if (x > X0 + 12 && x < X1 - 12) ticks.push(`<text x="${x.toFixed(1)}" y="${anchor === 'top' ? Y0 - 8 : Y1 + 15}" text-anchor="middle">${fmtDeg(((v + 540) % 360) - 180, 'E', 'W', step)}</text>`);
      }
    }
    for (let v = la0; v <= la1 + 1e-9; v += step) {
      const line = range(lo0 - step, lo1 + step + 1e-9, step / 40).map(x => [x, v]);
      for (const [xx, side] of [[X0, 'left'], [X1, 'right']]) {
        for (const y of crossings(line, (a, b) => ((a[0] - xx) * (b[0] - xx) <= 0 && a[0] !== b[0] ? a[1] + (b[1] - a[1]) * (xx - a[0]) / (b[0] - a[0]) : null)))
          if (y > Y0 + 10 && y < Y1 - 10) ticks.push(`<text transform="translate(${side === 'left' ? X0 - 8 : X1 + 8},${y.toFixed(1)}) rotate(-90)" text-anchor="middle" dy="${side === 'left' ? 0 : 7}">${fmtDeg(v, 'N', 'S', step)}</text>`);
      }
    }
  }
  parts.push(`<g font-family="${FONT}" font-size="8.5" fill="#4a4a4a">${[...new Set(ticks)].join('')}</g>`);
  const c0 = proj(center), c1 = proj([center[0] + 10 / (111.32 * Math.cos(center[1] * Math.PI / 180)), center[1]]);
  const pxPerKm = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) / 10;
  const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000].find(L => L * pxPerKm >= 80) || 2000;
  const L = nice * pxPerKm, sx = X0 + 12, sy = Y1 - 16;
  parts.push(`<g font-family="${FONT}" font-size="8.5" fill="#121212"><rect x="${sx - 6}" y="${sy - 13}" width="${L + 34}" height="24" fill="#fff" fill-opacity="0.9"/>` +
    [0, 1, 2, 3].map(i => `<rect x="${(sx + i * L / 4).toFixed(1)}" y="${sy}" width="${(L / 4).toFixed(1)}" height="3.5" fill="${i % 2 ? '#fff' : '#121212'}" stroke="#121212" stroke-width="0.5"/>`).join('') +
    `<text x="${sx}" y="${sy - 3}" text-anchor="middle">0</text><text x="${(sx + L).toFixed(1)}" y="${sy - 3}" text-anchor="middle">${nice}</text><text x="${(sx + L + 6).toFixed(1)}" y="${sy + 4}">km</text></g>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="detail-map" role="img" aria-label="${esc(`Map of the area of ${e.id}, ${e.place}`)}">${parts.join('')}</svg>`;
  return { svg, meta: { borders: borderDate, rail: !!rail, roads: !!roads, sites: pts.length, step } };
}

fs.mkdirSync(OUT, { recursive: true });
const rows = parseCSV(fs.readFileSync(CSV, 'utf8')).filter(r => (r.status || '').toLowerCase() === 'published' && r.lat !== '' && r.lon !== '' && Number.isFinite(+r.lat));
const only = process.argv[6] ? new Set(process.argv[6].split(',')) : null;
const manifest = fs.existsSync(path.join(OUT, 'manifest.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8')) : {};
for (const e of rows) {
  if (only && !only.has(e.id)) continue;
  try {
    const { svg, meta } = draw(e);
    fs.writeFileSync(path.join(OUT, e.id.toLowerCase() + '.svg'), svg);
    manifest[e.id] = meta;
    console.log(e.id, (svg.length / 1024).toFixed(0) + ' KB', JSON.stringify(meta));
  } catch (err) {
    console.log(e.id, 'FAILED', err.message);
  }
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
