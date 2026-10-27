/* The plate: interactive world map of the register, its scale of years, the register list and the record.
   Data: data/events.json (built from the master sheet), Natural Earth land, CShapes 2.0 boundaries by period. */
(function () {
  'use strict';
  var TYPES = ['missed', 'obvious', 'false-alarm', 'wrongly-blamed', 'still-open'];
  var TNAME = { missed: 'Missed', obvious: 'Obvious', 'false-alarm': 'False alarm', 'wrongly-blamed': 'Wrongly blamed', 'still-open': 'Still open' };
  var TDEF = {
    missed: 'the pieces existed, but no one put them together until late, or ever',
    obvious: 'the attacker claimed it, or the target made it plain',
    'false-alarm': 'treated as a possible attack; turned out to be an accident or failure',
    'wrongly-blamed': 'joined into an attack claim that later fell apart',
    'still-open': 'suspected, never settled'
  };
  // one color per class, and a pale wash of the same color inside the open shapes
  var INK = { missed: '#1f4f8f', obvious: '#00876f', 'false-alarm': '#b07a00', 'wrongly-blamed': '#9a68c4', 'still-open': '#4a4a4a' };
  var WASH = { missed: '#c7d3e3', obvious: '#bfe1db', 'false-alarm': '#ebdebf', 'wrongly-blamed': '#e6d9f0', 'still-open': '#e4e4e4' };
  var RED = '#b3261e';
  var DECADES = [1945, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
  var decName = function (d) { return d === 1945 ? '1945 to 1959' : d === 2020 ? '2020 to 2026' : d + ' to ' + (d + 9); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var $ = function (id) { return document.getElementById(id); };
  var getJSON = function (u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u + ': HTTP ' + r.status); return r.json(); }); };

  function shape(e, s) {
    var c = INK[e.case_type] || '#121212', w = WASH[e.case_type] || '#fff';
    if (e.scope === 'adjacent') return { d: 'M' + (-s) + ',' + (-s) + 'h' + 2 * s + 'v' + 2 * s + 'h' + (-2 * s) + 'Z', fill: e.case_type === 'missed' ? c : w, st: c, sw: 1.2 };
    if (e.case_type === 'missed') return { d: circ(s), fill: c, st: c, sw: 0.8 };
    if (e.case_type === 'obvious') return { d: circ(s), fill: w, st: c, sw: 1.35 };
    if (e.case_type === 'still-open') return { d: 'M0,' + (-s * 1.3) + 'L' + s * 1.3 + ',0L0,' + s * 1.3 + 'L' + (-s * 1.3) + ',0Z', fill: w, st: c, sw: 1.35 };
    if (e.case_type === 'false-alarm') return { d: 'M0,' + (-s * 1.3) + 'L' + s * 1.18 + ',' + s * 0.82 + 'L' + (-s * 1.18) + ',' + s * 0.82 + 'Z', fill: w, st: c, sw: 1.35 };
    return { d: 'M' + (-s) + ',' + (-s) + 'L' + s + ',' + s + 'M' + (-s) + ',' + s + 'L' + s + ',' + (-s), fill: 'none', st: c, sw: 1.9 };
  }
  function circ(s) { return 'M' + (-s) + ',0a' + s + ',' + s + ' 0 1,0 ' + 2 * s + ',0a' + s + ',' + s + ' 0 1,0 ' + (-2 * s) + ',0Z'; }
  function icon(e, size) {
    var sh = shape(e, 3.6);
    return '<svg width="' + (size || 13) + '" height="' + (size || 13) + '" viewBox="-6.5 -6.5 13 13" aria-hidden="true"><path d="' + sh.d + '" fill="' + sh.fill + '" stroke="' + sh.st + '" stroke-width="' + sh.sw + '" stroke-linejoin="round"/></svg>';
  }

  Promise.all([getJSON('data/events.json'), getJSON('assets/data/land-50m.json'), getJSON('assets/data/land-110m.json'), getJSON('assets/data/borders-cshapes.json')])
    .then(function (r) { init(r[0], r[1], r[2], r[3]); })
    .catch(function (err) {
      var l = $('plate-loading');
      if (l) l.innerHTML = 'The plate could not load (' + esc(err.message) + '). Every entry is listed in the <a href="events/index.html">register</a>.';
    });

  function init(EV, L50, L110, BOR) {
    var state = { types: new Set(TYPES), adj: true, decade: null, sel: null, q: '', svc: '', ctx: '', harm: false, vfy: false };
    var byId = {};
    EV.forEach(function (e) { byId[e.id] = e; e._hay = [e.id, e.label, e.title, e.place, e.dates, e.summary, e.records, e.gap, e.joining].join(' ').toLowerCase(); });
    $('plate-loading').remove();
    $('plate-svg').removeAttribute('hidden');
    document.querySelectorAll('.js-only').forEach(function (n) { n.removeAttribute('hidden'); });

    // ---------- the plate ----------
    var W = 1100, ML = 50, MR = 50, MT = 30, MB = 36;
    var proj = d3.geoEqualEarth().rotate([-10, 0]).fitWidth(W, { type: 'Sphere' });
    var yTop = proj([0, 82])[1], yBot = proj([0, -58])[1];
    var H = Math.round(yBot - yTop);
    proj.translate([proj.translate()[0], proj.translate()[1] - yTop]);
    var VBW = W + ML + MR, VBH = H + MT + MB;
    var path = d3.geoPath(proj);
    var svg = d3.select('#plate-svg').attr('viewBox', '0 0 ' + VBW + ' ' + VBH);
    var defs = svg.append('defs');
    defs.append('clipPath').attr('id', 'mapclip').append('rect').attr('width', W).attr('height', H);
    var land50 = topojson.feature(L50, L50.objects.land), land110 = topojson.feature(L110, L110.objects.land);
    defs.append('path').attr('id', 'land-s').attr('d', path(land110));
    defs.append('path').attr('id', 'land-l').attr('d', path(land50));

    // frame: outer rule, graduated band, inner rule
    var F = svg.append('g').attr('class', 'frame');
    var band = 5;
    F.append('rect').attr('x', ML - band).attr('y', MT - band).attr('width', W + 2 * band).attr('height', H + 2 * band).attr('fill', 'none').attr('stroke', '#121212').attr('stroke-width', 1.5);
    for (var lat = -60; lat < 82; lat += 10) {
      var y1 = Math.max(0, proj([0, Math.min(lat + 10, 82)])[1]), y2 = Math.min(H, proj([0, Math.max(lat, -58)])[1]);
      if (y2 <= y1) continue;
      var dark = ((lat + 60) / 10) % 2 === 0;
      [ML - band, ML + W].forEach(function (x) { F.append('rect').attr('x', x).attr('y', MT + y1).attr('width', band).attr('height', y2 - y1).attr('fill', dark ? '#121212' : '#fff').attr('stroke', '#121212').attr('stroke-width', 0.35); });
    }
    [[82, MT - band], [-58, MT + H]].forEach(function (cut) {
      for (var lon = -170; lon < 190; lon += 10) {
        var a = proj([lon, cut[0]]), b = proj([lon + 10, cut[0]]);
        if (!a || !b || b[0] < a[0]) continue;
        var dk = ((lon + 170) / 10) % 2 === 0;
        F.append('rect').attr('x', ML + a[0]).attr('y', cut[1]).attr('width', b[0] - a[0]).attr('height', band).attr('fill', dk ? '#121212' : '#fff').attr('stroke', '#121212').attr('stroke-width', 0.35);
      }
    });
    F.append('rect').attr('x', ML).attr('y', MT).attr('width', W).attr('height', H).attr('fill', 'none').attr('stroke', '#121212').attr('stroke-width', 0.5);
    [60, 30, 0, -30].forEach(function (la) {
      var y = MT + proj([0, la])[1] + 3.5, t = la === 0 ? '0°' : Math.abs(la) + '° ' + (la > 0 ? 'N' : 'S');
      F.append('text').attr('class', 'deg').attr('x', ML - band - 5).attr('y', y).attr('text-anchor', 'end').text(t);
      F.append('text').attr('class', 'deg').attr('x', ML + W + band + 5).attr('y', y).text(t);
    });
    [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].forEach(function (lo) {
      var p = proj([lo, -58]); if (!p) return;
      var t = lo === 0 ? '0°' : Math.abs(lo) + '° ' + (lo > 0 ? 'E' : 'W');
      F.append('text').attr('class', 'deg').attr('x', ML + p[0]).attr('y', MT + H + band + 13).attr('text-anchor', 'middle').text(t);
    });

    var mapG = svg.append('g').attr('transform', 'translate(' + ML + ',' + MT + ')');
    var clipped = mapG.append('g').attr('clip-path', 'url(#mapclip)');
    clipped.append('rect').attr('width', W).attr('height', H).attr('fill', '#fff');
    var Z = clipped.append('g');
    // water lining: rings drawn outward from the coast, spacing widening with distance (after Mitchell, 1849)
    var RINGS = [[1.8, '#6e6e6e'], [3.7, '#878787'], [6.0, '#a0a0a0'], [8.8, '#b8b8b8'], [12.2, '#cfcfcf']];
    var sea = Z.append('g').attr('class', 'water');
    for (var i = RINGS.length - 1; i >= 0; i--) {
      var dd = RINGS[i][0], tt = 0.55;
      sea.append('use').attr('href', '#land-s').attr('fill', 'none').attr('stroke', RINGS[i][1]).attr('stroke-width', 2 * dd + tt).attr('stroke-linejoin', 'round').attr('vector-effect', 'non-scaling-stroke');
      sea.append('use').attr('href', '#land-s').attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 2 * dd - tt).attr('stroke-linejoin', 'round').attr('vector-effect', 'non-scaling-stroke');
    }
    Z.append('path').attr('d', path(d3.geoGraticule().step([15, 15])())).attr('fill', 'none').attr('stroke', '#dedede').attr('stroke-width', 0.45).attr('vector-effect', 'non-scaling-stroke');
    Z.append('path').attr('d', path({ type: 'Sphere' })).attr('fill', 'none').attr('stroke', '#121212').attr('stroke-width', 0.7).attr('vector-effect', 'non-scaling-stroke');
    Z.append('use').attr('href', '#land-l').attr('fill', '#fff').attr('stroke', '#121212').attr('stroke-width', 0.75).attr('stroke-linejoin', 'round').attr('vector-effect', 'non-scaling-stroke');
    var bordersG = Z.append('path').attr('fill', 'none').attr('stroke', '#7a7a7a').attr('stroke-width', 0.6).attr('stroke-dasharray', '4 1.6 1 1.6').attr('vector-effect', 'non-scaling-stroke');
    var namesG = Z.append('g');
    var seaG = Z.append('g');
    [['PACIFIC OCEAN', -140, 8], ['PACIFIC OCEAN', 162, 24], ['ATLANTIC OCEAN', -38, 22], ['INDIAN OCEAN', 78, -22], ['SOUTHERN OCEAN', 30, -52]].forEach(function (s) {
      var p = proj([s[1], s[2]]); seaG.append('g').attr('class', 'cs').datum({ x: p[0], y: p[1] }).attr('transform', 'translate(' + p + ')').append('text').attr('class', 'sea-name').attr('text-anchor', 'middle').text(s[0]);
    });
    var linkG = Z.append('g'), markG = Z.append('g'), hoverG = Z.append('g'), selG = Z.append('g');

    // place markers, separating markers that fall on the same spot
    var placed = [];
    EV.forEach(function (e) {
      if (e.lat == null) return;
      var p = proj([e.lon, e.lat]); if (!p) return;
      var x = p[0], y = p[1];
      var near = placed.filter(function (q) { return Math.hypot(q.x - x, q.y - y) < 2.2; }).length;
      if (near) { var a = near * 2.4, r = 1.8 * Math.sqrt(near); x += Math.cos(a) * r; y += Math.sin(a) * r; }
      e.x = x; e.y = y; placed.push(e);
    });
    var mk = markG.selectAll('g.mk').data(placed, function (e) { return e.id; }).join('g').attr('class', 'mk').attr('transform', function (e) { return 'translate(' + e.x + ',' + e.y + ')'; });
    mk.append('title').text(function (e) { return e.n + '. ' + e.label + ' (' + TNAME[e.case_type] + ')'; });
    mk.append('circle').attr('class', 'hit').attr('r', 7);
    // a thin white halo lifts each mark off the coastlines and off its neighbours
    mk.append('path').each(function (e) { var s = shape(e, 3.3); d3.select(this).attr('d', s.d).attr('fill', '#fff').attr('stroke', '#fff').attr('stroke-width', s.sw + 1.8).attr('stroke-linejoin', 'round').attr('vector-effect', 'non-scaling-stroke'); });
    mk.append('path').each(function (e) { var s = shape(e, 3.3); d3.select(this).attr('d', s.d).attr('fill', s.fill).attr('stroke', s.st).attr('stroke-width', s.sw).attr('stroke-linejoin', 'round').attr('vector-effect', 'non-scaling-stroke'); });
    mk.append('text').attr('class', 'num').attr('x', 5.5).attr('y', 3.2).text(function (e) { return e.n; });

    var k = 1;
    function counter(sel) { sel.attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ') scale(' + (1 / k) + ')'; }); }
    var zoom = d3.zoom().extent([[0, 0], [W, H]]).scaleExtent([1, 22]).translateExtent([[0, 0], [W, H]]).on('zoom', function (ev) {
      k = ev.transform.k; Z.attr('transform', ev.transform);
      counter(mk); counter(namesG.selectAll('g.cs')); counter(seaG.selectAll('g.cs')); counter(selG.selectAll('g.cs')); counter(hoverG.selectAll('g.cs')); counter(linkG.selectAll('g.cs'));
      svg.classed('near', k >= 2.4);
    });
    mapG.call(zoom).on('dblclick.zoom', null);
    $('zin').onclick = function () { mapG.transition().duration(300).call(zoom.scaleBy, 1.8); };
    $('zout').onclick = function () { mapG.transition().duration(300).call(zoom.scaleBy, 1 / 1.8); };
    $('zall').onclick = function () { mapG.transition().duration(400).call(zoom.transform, d3.zoomIdentity); };

    mk.on('mouseenter', function (ev, e) { if (e.id === state.sel) return; hover(e); })
      .on('mouseleave', function () { hoverG.selectAll('*').remove(); })
      .on('click', function (ev, e) { ev.stopPropagation(); select(e.id, false); });

    function tag(g, e, cls, color) {
      var right = e.x < W * 0.78;
      var c = g.append('g').attr('class', 'cs').datum({ x: e.x, y: e.y });
      var dx = right ? 1 : -1;
      c.append('line').attr('x1', dx * 5).attr('y1', -5).attr('x2', dx * 15).attr('y2', -15).attr('stroke', color).attr('stroke-width', 0.8);
      c.append('text').attr('class', cls).attr('x', dx * 17).attr('y', -15.5).attr('text-anchor', right ? 'start' : 'end').text(e.n + '  ' + e.label);
      counter(c);
      return c;
    }
    function hover(e) { hoverG.selectAll('*').remove(); tag(hoverG, e, 'lab', '#121212'); }

    // ---------- boundaries and names for the period shown ----------
    function setBorders() {
      var dec = state.decade == null ? 2020 : state.decade, b = BOR[dec];
      if (!b) return;
      bordersG.attr('d', path({ type: 'MultiLineString', coordinates: b.lines }));
      namesG.selectAll('*').remove();
      b.labels.forEach(function (l) {
        var p = proj([l.lon, l.lat]); if (!p) return;
        namesG.append('g').attr('class', 'cs').datum({ x: p[0], y: p[1] }).append('text').attr('class', 'land-name' + (l.tier === 2 ? ' t2' : '')).attr('text-anchor', 'middle').text(l.n);
      });
      counter(namesG.selectAll('g.cs'));
      $('bnote').textContent = 'Boundaries of ' + b.date + (state.decade == null ? ', the latest in the series' : '');
    }

    // ---------- reference box: each line switches its class on and off ----------
    var ref = $('reference');
    TYPES.filter(function (t) { return EV.some(function (e) { return e.case_type === t; }); }).forEach(function (t) {
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-pressed', 'true'); b.dataset.type = t;
      b.innerHTML = icon({ case_type: t }) + '<span><b>' + TNAME[t] + '</b>: ' + TDEF[t] + '</span>';
      b.onclick = function () { if (state.types.has(t)) state.types.delete(t); else state.types.add(t); b.setAttribute('aria-pressed', state.types.has(t) ? 'true' : 'false'); apply(); };
      ref.appendChild(b);
    });
    var adjB = document.createElement('button'); adjB.type = 'button'; adjB.setAttribute('aria-pressed', 'true');
    adjB.innerHTML = icon({ scope: 'adjacent' }) + '<span>Square: company or military target, in the color of its class</span>';
    adjB.onclick = function () { state.adj = !state.adj; adjB.setAttribute('aria-pressed', state.adj ? 'true' : 'false'); apply(); };
    ref.appendChild(adjB);
    var bn = document.createElement('p'); bn.className = 'bnote'; bn.id = 'bnote'; ref.appendChild(bn);

    // ---------- scale of years, with a tally of entries for each year ----------
    var SC = d3.select('#scale-svg'), SH = 92, Y0 = 1945, Y1 = 2027;
    SC.attr('viewBox', '0 0 ' + VBW + ' ' + SH);
    var xs = d3.scaleLinear().domain([Y0, Y1]).range([ML, ML + W]);
    var tallyG = SC.append('g'), segG = SC.append('g'), bracketG = SC.append('g');
    var spans = DECADES.map(function (d, i) { return { d: d, a: d, b: i < DECADES.length - 1 ? DECADES[i + 1] : Y1 }; });
    var barY = 56;
    var toggleDecade = function (d) { state.decade = state.decade === d ? null : d; apply(); setBorders(); syncHash(); };
    var seg = segG.selectAll('g').data(spans).join('g').attr('class', 'seg').attr('role', 'button').attr('tabindex', 0)
      .attr('aria-label', function (s) { return 'Show ' + decName(s.d); })
      .on('click', function (ev, s) { toggleDecade(s.d); })
      .on('keydown', function (ev, s) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggleDecade(s.d); } });
    seg.append('rect').attr('x', function (s) { return xs(s.a); }).attr('y', 4).attr('width', function (s) { return xs(s.b) - xs(s.a); }).attr('height', barY + 26).attr('fill', 'transparent');
    seg.append('rect').attr('class', 'band').attr('x', function (s) { return xs(s.a); }).attr('y', barY).attr('width', function (s) { return xs(s.b) - xs(s.a); }).attr('height', 6)
      .attr('fill', function (s, i) { return i % 2 === 0 ? '#121212' : '#fff'; }).attr('stroke', '#121212').attr('stroke-width', 0.7);
    SC.append('g').selectAll('text').data(DECADES.concat([2026])).join('text').attr('x', function (y) { return xs(y === 2026 ? 2026.5 : y); }).attr('y', barY + 19).attr('text-anchor', 'middle').text(function (y) { return y; });
    SC.append('text').attr('x', ML - 8).attr('y', barY + 6).attr('text-anchor', 'end').text('Years');

    function drawTally(shown) {
      var sh = new Set(shown.map(function (e) { return e.id; }));
      var by = {};
      EV.filter(function (e) { return matches(e, true); }).forEach(function (e) { (by[e.year] = by[e.year] || []).push(e); });
      var cells = [];
      Object.keys(by).forEach(function (y) {
        by[y].sort(function (a, b) { return TYPES.indexOf(a.case_type) - TYPES.indexOf(b.case_type); })
          .forEach(function (e, j) { cells.push({ y: +y, j: j, t: e.case_type, on: sh.has(e.id), sel: e.id === state.sel }); });
      });
      var w = (xs(1) - xs(0)) * 0.66;
      tallyG.selectAll('rect').data(cells).join('rect')
        .attr('x', function (c) { return xs(c.y + 0.5) - w / 2; }).attr('y', function (c) { return barY - 4 - c.j * 1.42; })
        .attr('width', w).attr('height', 1.0).attr('fill', function (c) { return c.sel ? RED : c.on ? INK[c.t] : '#d9d9d9'; });
      bracketG.selectAll('*').remove();
      if (state.decade != null) {
        var s = spans.filter(function (x) { return x.d === state.decade; })[0];
        bracketG.append('path').attr('d', 'M' + (xs(s.a) + 1) + ',' + (barY + 30) + 'v4H' + (xs(s.b) - 1) + 'v-4').attr('fill', 'none').attr('stroke', '#121212').attr('stroke-width', 0.8);
        bracketG.append('text').attr('x', (xs(s.a) + xs(s.b)) / 2).attr('y', barY + 34.5).attr('dy', '0.9em').attr('text-anchor', 'middle').text(decName(s.d)).style('font-size', '11px').style('fill', '#121212');
      }
    }

    // ---------- filters ----------
    $('q').oninput = function () { state.q = this.value.trim().toLowerCase(); apply(); };
    $('svc').onchange = function () { state.svc = this.value; apply(); };
    $('ctx').onchange = function () { state.ctx = this.value; apply(); };
    $('harm').onchange = function () { state.harm = this.checked; apply(); };
    $('vfy').onchange = function () { state.vfy = this.checked; apply(); };
    $('all-years').onclick = function () { state.decade = null; apply(); setBorders(); syncHash(); };

    function matches(e, ignoreDecade) {
      if (!state.types.has(e.case_type)) return false;
      if (!state.adj && e.scope === 'adjacent') return false;
      if (state.svc && e.services.indexOf(state.svc) < 0) return false;
      if (state.ctx && e.context !== state.ctx) return false;
      if (state.harm && !e.harm) return false;
      if (state.vfy && !e.verified) return false;
      if (state.q && e._hay.indexOf(state.q) < 0) return false;
      if (!ignoreDecade && state.decade != null && e.decade !== state.decade) return false;
      return true;
    }

    function yrs(e) { var m = String(e.dates).match(/(19|20)\d\d/g) || [String(e.year)]; var a = m[0], b = m[m.length - 1]; return a === b ? a : a + '–' + (a.slice(0, 2) === b.slice(0, 2) ? b.slice(2) : b); }

    function apply() {
      var shown = EV.filter(function (e) { return matches(e, false); });
      var on = new Set(shown.map(function (e) { return e.id; }));
      mk.attr('display', function (e) { return on.has(e.id) ? null : 'none'; });
      var selShown = state.sel && on.has(state.sel); selG.attr('display', selShown ? null : 'none'); linkG.attr('display', selShown ? null : 'none');
      drawTally(shown);
      $('scale-state').textContent = state.decade == null ? 'All years shown. Select a span of the scale to show one period.' : decName(state.decade) + ' shown, with the boundaries of that period.';
      $('all-years').hidden = state.decade == null;
      $('count').textContent = shown.length + ' of ' + EV.length + ' entries';
      var groups = {};
      shown.slice().sort(function (a, b) { return a.year - b.year || a.n - b.n; }).forEach(function (e) { (groups[e.decade] = groups[e.decade] || []).push(e); });
      $('reg').innerHTML = DECADES.filter(function (d) { return groups[d]; }).map(function (d) {
        return '<div class="reg-group"><h3>' + decName(d) + '</h3><ul class="reg-list">' + groups[d].map(function (e) {
          return '<li><button type="button" data-id="' + e.id + '"' + (e.id === state.sel ? ' aria-current="true"' : '') + '>' + icon(e, 11) + '<span class="no">' + e.n + '</span><span class="lt">' + esc(e.label) +
            (e.lat == null ? ' <span class="unplaced">(not placed)</span>' : '') + '</span><span class="lead"></span><span class="yr">' + yrs(e) + '</span></button></li>';
        }).join('') + '</ul></div>';
      }).join('') || '<p class="muted">No entry matches these settings.</p>';
    }
    $('reg').addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-id]');
      if (b) { select(b.dataset.id, true); $('plate').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });

    // ---------- the record ----------
    function fmtCoord(lat, lon) { return Math.abs(lat).toFixed(2) + '° ' + (lat >= 0 ? 'N' : 'S') + ', ' + Math.abs(lon).toFixed(2) + '° ' + (lon >= 0 ? 'E' : 'W'); }
    function locator(e) {
      var w = 300, p2 = d3.geoEqualEarth().rotate([-10, 0]).fitWidth(w, { type: 'Sphere' });
      var t = p2([0, 84])[1], bt = p2([0, -60])[1], h = Math.round(bt - t);
      p2.translate([p2.translate()[0], p2.translate()[1] - t]);
      var pa = d3.geoPath(p2), pt = p2([e.lon, e.lat]);
      return '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Position of the event on a world map">' +
        '<rect width="' + w + '" height="' + h + '" fill="#fff" stroke="#121212" stroke-width="0.8"/>' +
        '<path d="' + pa(d3.geoGraticule().step([30, 30])()) + '" fill="none" stroke="#e2e2e2" stroke-width="0.4"/>' +
        '<path d="' + pa(land110) + '" fill="#fff" stroke="#121212" stroke-width="0.45"/>' +
        '<path d="' + pa({ type: 'Sphere' }) + '" fill="none" stroke="#121212" stroke-width="0.5"/>' +
        '<g stroke="' + RED + '" stroke-width="0.9" fill="none"><circle cx="' + pt[0] + '" cy="' + pt[1] + '" r="5"/><path d="M' + (pt[0] - 11) + ',' + pt[1] + 'h7M' + (pt[0] + 4) + ',' + pt[1] + 'h7M' + pt[0] + ',' + (pt[1] - 11) + 'v7M' + pt[0] + ',' + (pt[1] + 4) + 'v7"/></g></svg>';
    }
    // the sheet gives one holder per line ("Holder: what it held."); older rows are a single paragraph
    function holders(s) {
      var lines = String(s || '').split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean);
      var isList = lines.length > 1 || (lines.length === 1 && /^[^:;,]{2,60}:\s/.test(lines[0]) && lines[0].indexOf(';') < 0);
      if (!isList) return s ? '<p>' + esc(s) + '</p>' : '';
      return '<ul class="holders">' + lines.map(function (l) { var k = l.indexOf(':'); return k > 0 && k < 90 ? '<li><i>' + esc(l.slice(0, k)) + ':</i> ' + esc(l.slice(k + 1).trim()) + '</li>' : '<li>' + esc(l) + '</li>'; }).join('') + '</ul>';
    }
    function record(e) {
      var r = $('record');
      var row = function (dt, dd) { return dd ? '<dt>' + dt + '</dt><dd>' + dd + '</dd>' : ''; };
      var p = function (s) { return s ? '<p>' + esc(s) + '</p>' : ''; };
      var src = '<ol>' + (e.sources || []).map(function (s) { return '<li>' + esc(s.cite) + (s.url ? ' <a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]) + '</a>' : '') + '</li>'; }).join('') + '</ol>';
      r.innerHTML = '<div class="rec-head"><p class="rec-code">' + e.id.toLowerCase() + '</p><h2>' + esc(e.title) + '</h2><button class="rec-close" type="button" id="rec-close">CLOSE RECORD</button></div>' +
        '<dl class="fields">' +
          row('Date', p(e.dates)) + row('Place', p(e.place)) + row('Service', p(e.services.join(', '))) + row('Context', p(e.context)) +
          row('Classification', '<p>' + icon(e, 13) + ' ' + TNAME[e.case_type] + (e.scope === 'adjacent' ? ', adjacent case' : '') + '. ' + TDEF[e.case_type].charAt(0).toUpperCase() + TDEF[e.case_type].slice(1) + '.</p>') +
          row('Summary', p(e.summary)) + row('Holders of the record', holders(e.records)) + row('Why the records stayed apart', p(e.gap)) + row('Joined by', p(e.joining)) +
          row('Harm found later', p(e.harm)) + row('Sources', (e.sources || []).length ? src : '') +
          row('Verification', e.verification ? '<p class="muted">' + esc(e.verification) + '</p>' : '') +
        '</dl>' +
        '<div class="rec-side">' +
        (e.lat != null ? '<figure class="locator">' + locator(e) + '<figcaption>' + fmtCoord(e.lat, e.lon) + (e.precision === 'approximate' ? ', approximate' : e.precision === 'area' ? ', center of the area concerned' : '') + '</figcaption></figure>' : '<p class="muted">Not placed on the plate: the entry concerns several countries.</p>') +
        '<p class="rec-links"><a href="' + esc(e.url) + '">Permanent page for this entry</a></p></div>';
      r.hidden = false;
      $('rec-close').onclick = closeRecord;
      // the chronology and the detail map are drawn into the entry's own page; take them from there
      fetch(e.url).then(function (res) { return res.ok ? res.text() : ''; }).then(function (html) {
        if (!html || state.sel !== e.id) return;
        var x = new DOMParser().parseFromString(html, 'text/html').querySelector('.rec-extra');
        if (x) r.appendChild(document.importNode(x, true));
      }).catch(function () {});
    }
    function closeRecord() {
      state.sel = null; $('record').hidden = true; selG.selectAll('*').remove(); linkG.selectAll('*').remove(); apply(); syncHash();
    }
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && state.sel) closeRecord(); });

    function select(id, fly) {
      var e = byId[id]; if (!e) return;
      state.sel = id;
      if (!state.types.has(e.case_type)) { state.types.add(e.case_type); document.querySelector('.reference button[data-type="' + e.case_type + '"]').setAttribute('aria-pressed', 'true'); }
      if (e.scope === 'adjacent' && !state.adj) { state.adj = true; adjB.setAttribute('aria-pressed', 'true'); }
      if (state.decade != null && state.decade !== e.decade) { state.decade = e.decade; setBorders(); }
      hoverG.selectAll('*').remove(); selG.selectAll('*').remove(); linkG.selectAll('*').remove();
      if (e.x != null) {
        (e.more || []).forEach(function (m) {
          var q = proj([m[1], m[0]]); if (!q) return;
          linkG.append('line').attr('x1', e.x).attr('y1', e.y).attr('x2', q[0]).attr('y2', q[1]).attr('stroke', RED).attr('stroke-width', 0.8).attr('stroke-dasharray', '3 2').attr('vector-effect', 'non-scaling-stroke');
          var c = linkG.append('g').attr('class', 'cs').datum({ x: q[0], y: q[1] }); c.append('circle').attr('r', 2.6).attr('fill', '#fff').attr('stroke', RED).attr('stroke-width', 1);
        });
        var c = selG.append('g').attr('class', 'cs').datum({ x: e.x, y: e.y });
        c.append('circle').attr('r', 7.5).attr('fill', 'none').attr('stroke', RED).attr('stroke-width', 1.3);
        tag(selG, e, 'sel-lab', RED);
        counter(selG.selectAll('g.cs')); counter(linkG.selectAll('g.cs'));
        if (fly) { var kk = Math.max(k, 3); mapG.transition().duration(650).call(zoom.transform, d3.zoomIdentity.translate(W / 2 - kk * e.x, H / 2 - kk * e.y).scale(kk)); }
      }
      record(e);
      apply();
      syncHash();
    }

    // ---------- links: #ag-110 opens an entry, #d1980 shows a period ----------
    function syncHash() {
      var h = state.sel ? '#' + state.sel.toLowerCase() : state.decade != null ? '#d' + state.decade : '';
      if (history.replaceState) history.replaceState(null, '', h || location.pathname + location.search);
    }
    function fromHash() {
      var h = (location.hash || '').slice(1).toLowerCase();
      if (/^ag-\d+$/.test(h) && byId[h.toUpperCase()]) { select(h.toUpperCase(), true); $('plate').scrollIntoView({ block: 'start' }); }
      else if (/^d\d{4}$/.test(h) && DECADES.indexOf(+h.slice(1)) >= 0) { state.decade = +h.slice(1); apply(); setBorders(); }
    }

    setBorders();
    apply();
    fromHash();
    window.addEventListener('hashchange', fromHash);
  }
})();
