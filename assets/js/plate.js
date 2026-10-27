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
  var INK = { missed: '#1f4f8f', obvious: '#00876f', 'false-alarm': '#9c6a00', 'wrongly-blamed': '#9a68c4', 'still-open': '#4d4237' };
  var WASH = { missed: '#c7d3e3', obvious: '#bfe1db', 'false-alarm': '#ebdebf', 'wrongly-blamed': '#e6d9f0', 'still-open': '#e6dcc6' };
  var RED = '#a8261c';
  // the sheet: buff paper for the sea, a paler hand-laid tint for the land, iron-gall ink
  var PAPER = '#f0e4c8', LAND = '#f8f0dc', INK0 = '#2b2118';
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

    // frame: outer rule, graduated band, inner rule
    var F = svg.append('g').attr('class', 'frame');
    var band = 5;
    F.append('rect').attr('x', ML - band).attr('y', MT - band).attr('width', W + 2 * band).attr('height', H + 2 * band).attr('fill', 'none').attr('stroke', INK0).attr('stroke-width', 1.5);
    for (var lat = -60; lat < 82; lat += 10) {
      var y1 = Math.max(0, proj([0, Math.min(lat + 10, 82)])[1]), y2 = Math.min(H, proj([0, Math.max(lat, -58)])[1]);
      if (y2 <= y1) continue;
      var dark = ((lat + 60) / 10) % 2 === 0;
      [ML - band, ML + W].forEach(function (x) { F.append('rect').attr('x', x).attr('y', MT + y1).attr('width', band).attr('height', y2 - y1).attr('fill', dark ? INK0 : PAPER).attr('stroke', INK0).attr('stroke-width', 0.35); });
    }
    [[82, MT - band], [-58, MT + H]].forEach(function (cut) {
      for (var lon = -170; lon < 190; lon += 10) {
        var a = proj([lon, cut[0]]), b = proj([lon + 10, cut[0]]);
        if (!a || !b || b[0] < a[0]) continue;
        var dk = ((lon + 170) / 10) % 2 === 0;
        F.append('rect').attr('x', ML + a[0]).attr('y', cut[1]).attr('width', b[0] - a[0]).attr('height', band).attr('fill', dk ? INK0 : PAPER).attr('stroke', INK0).attr('stroke-width', 0.35);
      }
    });
    F.append('rect').attr('x', ML).attr('y', MT).attr('width', W).attr('height', H).attr('fill', 'none').attr('stroke', INK0).attr('stroke-width', 0.5);
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
    // the map area of the plate is left clear (it still takes the pointer), and the drawing of the world lies
    // under it in a layer of its own, so that a zoom or a drag moves that drawing as a picture and redraws it
    // only when the gesture ends
    clipped.append('rect').attr('width', W).attr('height', H).attr('fill', 'transparent');
    var Z = clipped.append('g');
    var stage = document.createElement('div');
    stage.className = 'plate-stage';
    var svgEl = $('plate-svg');
    svgEl.parentNode.insertBefore(stage, svgEl);
    var baseBox = document.createElement('div');
    baseBox.className = 'plate-base';
    baseBox.setAttribute('aria-hidden', 'true');
    baseBox.style.cssText = 'left:' + (ML / VBW * 100) + '%;top:' + (MT / VBH * 100) + '%;width:' + (W / VBW * 100) + '%;height:' + (H / VBH * 100) + '%;background:' + PAPER;
    stage.appendChild(baseBox);
    stage.appendChild(svgEl);
    // two copies: the whole world, drawn once and only ever moved (it shows at the edges during a drag), and the
    // view, drawn sharp at the end of each gesture
    var NS = 'http://www.w3.org/2000/svg';
    function baseLayer(cls) {
      var el = document.createElementNS(NS, 'svg');
      el.setAttribute('class', 'plate-layer ' + cls);
      el.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      el.setAttribute('preserveAspectRatio', 'none');
      baseBox.appendChild(el);
      return el;
    }
    var worldEl = baseLayer('plate-world'), viewEl = baseLayer('plate-view');
    var d110 = path(land110), d50 = path(land50);
    var RINGS = [[1.8, '#6b5a44'], [3.7, '#857259'], [6.0, '#a08b6f'], [8.8, '#b9a487'], [12.2, '#cfbc9e']];
    var borderPaths = [];
    function drawBase(el, fine) {
      // each layer keeps its own copy of the coastline, so that no reference crosses from one drawing to the other
      var id = fine ? 'view' : 'world', bd = d3.select(el).append('defs');
      bd.append('path').attr('id', 'coast-' + id).attr('d', d110);
      if (fine) bd.append('path').attr('id', 'land-' + id).attr('d', d50);
      var g = d3.select(el).append('g');
      // water lining: rings drawn outward from the coast, spacing widening with distance (after Mitchell, 1849)
      var sea = g.append('g').attr('class', 'water');
      for (var i = RINGS.length - 1; i >= 0; i--) {
        var dd = RINGS[i][0], tt = 0.55;
        sea.append('use').attr('href', '#coast-' + id).attr('fill', 'none').attr('stroke', RINGS[i][1]).attr('stroke-width', 2 * dd + tt).attr('stroke-linejoin', 'round').attr('vector-effect', 'non-scaling-stroke');
        sea.append('use').attr('href', '#coast-' + id).attr('fill', 'none').attr('stroke', PAPER).attr('stroke-width', 2 * dd - tt).attr('stroke-linejoin', 'round').attr('vector-effect', 'non-scaling-stroke');
      }
      g.append('path').attr('d', path(d3.geoGraticule().step([15, 15])())).attr('fill', 'none').attr('stroke', '#dccba5').attr('stroke-width', 0.45).attr('vector-effect', 'non-scaling-stroke');
      g.append('path').attr('d', path({ type: 'Sphere' })).attr('fill', 'none').attr('stroke', INK0).attr('stroke-width', 0.7).attr('vector-effect', 'non-scaling-stroke');
      g.append('use').attr('href', fine ? '#land-view' : '#coast-world').attr('fill', LAND).attr('stroke', INK0).attr('stroke-width', 0.75).attr('stroke-linejoin', 'round').attr('vector-effect', 'non-scaling-stroke');
      // boundaries hand-coloured with a ribbon of wash along each line, as on Victorian political maps
      borderPaths.push(g.append('path').attr('fill', 'none').attr('stroke', 'rgba(176,82,58,.22)').attr('stroke-width', 4.5).attr('stroke-linejoin', 'round').attr('vector-effect', 'non-scaling-stroke'));
      borderPaths.push(g.append('path').attr('fill', 'none').attr('stroke', '#6b5a44').attr('stroke-width', 0.6).attr('stroke-dasharray', '4 1.6 1 1.6').attr('vector-effect', 'non-scaling-stroke'));
      return g;
    }
    drawBase(worldEl, false);
    var viewG = drawBase(viewEl, true);
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
    // each mark is a map pin: a shadow on the paper, a thin halo, the coloured head and a glint of light on it
    mk.append('path').attr('class', 'pin-shadow').attr('transform', 'translate(1.4,1.8)').each(function (e) { var s = shape(e, 3.3); d3.select(this).attr('d', s.d).attr('fill', 'rgba(43,33,24,.32)').attr('stroke', 'rgba(43,33,24,.32)').attr('stroke-width', s.sw + 0.6).attr('stroke-linejoin', 'round'); });
    mk.append('path').each(function (e) { var s = shape(e, 3.3); d3.select(this).attr('d', s.d).attr('fill', LAND).attr('stroke', LAND).attr('stroke-width', s.sw + 1.8).attr('stroke-linejoin', 'round').attr('vector-effect', 'non-scaling-stroke'); });
    mk.append('path').each(function (e) { var s = shape(e, 3.3); d3.select(this).attr('d', s.d).attr('fill', s.fill).attr('stroke', s.st).attr('stroke-width', s.sw).attr('stroke-linejoin', 'round').attr('vector-effect', 'non-scaling-stroke'); });
    mk.filter(function (e) { return e.case_type !== 'wrongly-blamed' || e.scope === 'adjacent'; }).append('circle').attr('class', 'glint').attr('cx', -1.1).attr('cy', -1.2).attr('r', 0.95).attr('fill', '#fffaf0').attr('opacity', 0.75);
    mk.append('text').attr('class', 'num').attr('x', 5.5).attr('y', 3.2).text(function (e) { return e.n; });

    var k = 1;
    function counter(sel) { sel.attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ') scale(' + (1 / k) + ')'; }); }
    // during a gesture the drawing of the world is moved as a picture, by a CSS transform from the view last drawn;
    // when the gesture ends the view is drawn again at the new scale
    var drawn = d3.zoomIdentity, now = d3.zoomIdentity;
    function css(t) { return 'translate(' + (t.x / W * 100) + '%,' + (t.y / H * 100) + '%) scale(' + t.k + ')'; }
    function slide(t) {
      var r = t.k / drawn.k;
      worldEl.style.transform = css(t);
      viewEl.style.transform = css({ k: r, x: t.x - r * drawn.x, y: t.y - r * drawn.y });
    }
    function settle() {
      if (now.k === drawn.k && now.x === drawn.x && now.y === drawn.y) return;
      drawn = now;
      viewG.attr('transform', drawn);
      viewEl.style.transform = '';
    }
    var zoom = d3.zoom().extent([[0, 0], [W, H]]).scaleExtent([1, 22]).translateExtent([[0, 0], [W, H]]).on('zoom', function (ev) {
      now = ev.transform; slide(now);
      k = ev.transform.k; Z.attr('transform', ev.transform);
      counter(mk); counter(namesG.selectAll('g.cs')); counter(seaG.selectAll('g.cs')); counter(selG.selectAll('g.cs')); counter(hoverG.selectAll('g.cs')); counter(linkG.selectAll('g.cs'));
      svg.classed('near', k >= 2.4);
    }).on('end', settle);
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
      if (cls === 'sel-lab') {
        // the selected entry carries a small red paper flag on its pin
        c.append('line').attr('x1', 0).attr('y1', -3).attr('x2', 0).attr('y2', -30).attr('stroke', INK0).attr('stroke-width', 1);
        c.append('path').attr('d', 'M0,-30h' + dx * 17 + 'l' + (-dx * 4.5) + ',4.6l' + dx * 4.5 + ',4.6h' + (-dx * 17) + 'Z').attr('fill', color).attr('stroke', INK0).attr('stroke-width', 0.45);
        c.append('text').attr('class', cls).attr('x', dx * 21).attr('y', -21.5).attr('text-anchor', right ? 'start' : 'end').text(e.n + '  ' + e.label);
        counter(c);
        return c;
      }
      c.append('line').attr('x1', dx * 5).attr('y1', -5).attr('x2', dx * 15).attr('y2', -15).attr('stroke', color).attr('stroke-width', 0.8);
      c.append('text').attr('class', cls).attr('x', dx * 17).attr('y', -15.5).attr('text-anchor', right ? 'start' : 'end').text(e.n + '  ' + e.label);
      counter(c);
      return c;
    }
    function hover(e) { hoverG.selectAll('*').remove(); tag(hoverG, e, 'lab', INK0); }

    // ---------- boundaries and names for the period shown ----------
    function setBorders() {
      var dec = state.decade == null ? 2020 : state.decade, b = BOR[dec];
      if (!b) return;
      var d = path({ type: 'MultiLineString', coordinates: b.lines });
      borderPaths.forEach(function (p) { p.attr('d', d); });
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
      .attr('fill', function (s, i) { return i % 2 === 0 ? INK0 : PAPER; }).attr('stroke', INK0).attr('stroke-width', 0.7);
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
        bracketG.append('path').attr('d', 'M' + (xs(s.a) + 1) + ',' + (barY + 30) + 'v4H' + (xs(s.b) - 1) + 'v-4').attr('fill', 'none').attr('stroke', INK0).attr('stroke-width', 0.8);
        bracketG.append('text').attr('x', (xs(s.a) + xs(s.b)) / 2).attr('y', barY + 34.5).attr('dy', '0.9em').attr('text-anchor', 'middle').text(decName(s.d)).style('font-size', '11px').style('fill', INK0);
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

    // ---------- the record: the entry's own printed leaf, taken from its page ----------
    function record(e) {
      var r = $('record');
      r.innerHTML = '<div class="rec-bar"><button class="rec-close" type="button" id="rec-close">Close the record</button></div><p class="waiting">' + esc(e.id) + ', ' + esc(e.title) + '</p>';
      r.hidden = false;
      $('rec-close').onclick = closeRecord;
      fetch(e.url).then(function (res) { return res.ok ? res.text() : ''; }).then(function (html) {
        if (!html || state.sel !== e.id) return;
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var parts = [doc.querySelector('article.record'), doc.querySelector('.rec-extra')].filter(Boolean);
        if (!parts.length) return;
        // the leaf's links are written from events/ag-xxx/; rewrite them for the plate at the root
        parts.forEach(function (n) {
          n.querySelectorAll('[href], [src]').forEach(function (a) {
            ['href', 'src'].forEach(function (k) {
              var v = a.getAttribute(k);
              if (!v || /^(https?:|mailto:|#)/.test(v)) return;
              a.setAttribute(k, v.indexOf('../../') === 0 ? v.slice(6) : v.indexOf('../') === 0 ? 'events/' + v.slice(3) : 'events/' + e.id.toLowerCase() + '/' + v);
            });
          });
        });
        var w = r.querySelector('.waiting'); if (w) w.remove();
        parts.forEach(function (n) { r.appendChild(document.importNode(n, true)); });
      }).catch(function () {
        var w = r.querySelector('.waiting'); if (w) w.innerHTML = 'The record could not load. <a href="' + esc(e.url) + '">Open the entry\u2019s page</a>.';
      });
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
          var c = linkG.append('g').attr('class', 'cs').datum({ x: q[0], y: q[1] }); c.append('circle').attr('r', 2.6).attr('fill', LAND).attr('stroke', RED).attr('stroke-width', 1);
        });
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
