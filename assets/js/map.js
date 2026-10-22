/* Interactive map for the Aggregation Gap Atlas. Data: data/events.json (built from the master sheet). */
(function () {
  'use strict';
  var TYPE_LABEL = { core: 'Core', contrast: 'Contrast', control: 'Control', misattribution: 'Misattribution' };
  var DECADES = [1945, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
  var decLabel = function (d) { return d === 1945 ? '1945–59' : (d + 's'); };
  var W = 1000;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  function shapePath(e, s) {
    // path data centered on 0,0
    if (e.scope === 'adjacent') return 'M' + (-s) + ',' + (-s) + 'h' + 2 * s + 'v' + 2 * s + 'h' + (-2 * s) + 'Z';
    if (e.case_type === 'core' || e.case_type === 'contrast') return 'M' + (-s) + ',0a' + s + ',' + s + ' 0 1,0 ' + 2 * s + ',0a' + s + ',' + s + ' 0 1,0 ' + (-2 * s) + ',0Z';
    if (e.case_type === 'control') return 'M0,' + (-s * 1.25) + 'L' + s * 1.15 + ',' + s * 0.8 + 'L' + (-s * 1.15) + ',' + s * 0.8 + 'Z';
    return 'M' + (-s) + ',' + (-s) + 'L' + s + ',' + s + 'M' + (-s) + ',' + s + 'L' + s + ',' + (-s);
  }
  function shapeStyle(e) {
    if (e.case_type === 'misattribution' && e.scope !== 'adjacent') return 'fill="none" stroke="#141414" stroke-width="1.7"';
    var filled = e.case_type === 'core';
    return 'fill="' + (filled ? '#141414' : '#fff') + '" stroke="#141414" stroke-width="1.1"';
  }
  function iconSVG(e, size) {
    size = size || 13;
    return '<svg class="shape" width="' + size + '" height="' + size + '" viewBox="-7 -7 14 14" aria-hidden="true"><path d="' + shapePath(e, 4) + '" ' + shapeStyle(e) + '/></svg>';
  }

  var state = { types: new Set(Object.keys(TYPE_LABEL)), svc: '', ctx: '', q: '', harm: false, adj: true, vfy: false, decade: null, sel: null };
  var events = [], byId = {}, k = 1, zoom, svg, gZoom, gMarks, proj, H;

  Promise.all([
    fetch('data/events.json').then(function (r) { return r.json(); }),
    fetch('assets/data/world-50m.json').then(function (r) { return r.json(); })
  ]).then(function (res) { init(res[0], res[1]); }).catch(function (err) {
    $('map').innerHTML = '<p class="loading">The map could not load (' + esc(err.message) + '). The full list is on the <a href="events/index.html">Events</a> page.</p>';
  });

  function init(data, world) {
    events = data;
    events.forEach(function (e) {
      byId[e.id.toLowerCase()] = e;
      e._hay = [e.id, e.label, e.title, e.place, e.summary, e.gap, e.joining, e.dates].join(' ').toLowerCase();
    });

    var mapEl = $('map');
    mapEl.innerHTML = '';
    proj = d3.geoEqualEarth().rotate([-10, 0]).fitWidth(W, { type: 'Sphere' });
    var yTop = proj([0, 82])[1], yBot = proj([0, -58])[1];
    H = Math.round(yBot - yTop);
    proj.translate([proj.translate()[0], proj.translate()[1] - yTop]);
    var path = d3.geoPath(proj);

    svg = d3.select(mapEl).append('svg').attr('viewBox', '0 0 ' + W + ' ' + H).attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('role', 'img').attr('aria-label', 'World map of events; use the list beside it to select events with the keyboard');
    gZoom = svg.append('g');
    gZoom.append('path').attr('class', 'grat').attr('d', path(d3.geoGraticule10()));
    gZoom.append('path').attr('class', 'land').attr('d', path(topojson.feature(world, world.objects.land)));
    gZoom.append('path').attr('class', 'borders').attr('d', path(topojson.mesh(world, world.objects.countries, function (a, b) { return a !== b; })));
    var gLinks = gZoom.append('g');
    gMarks = gZoom.append('g');

    // place markers; separate markers that fall on the same spot
    var placed = [];
    events.forEach(function (e) {
      if (e.lat == null) return;
      var p = proj([e.lon, e.lat]); if (!p) return;
      var x = p[0], y = p[1];
      var near = placed.filter(function (q) { return Math.hypot(q.x - x, q.y - y) < 2.2; }).length;
      if (near) { var a = near * 2.4; x += Math.cos(a) * 1.8 * Math.sqrt(near); y += Math.sin(a) * 1.8 * Math.sqrt(near); }
      e.x = x; e.y = y; placed.push(e);
      e.extra = (e.more || []).map(function (m) { return proj([m[1], m[0]]); }).filter(Boolean);
    });
    gLinks.selectAll('g').data(placed.filter(function (e) { return e.extra.length; })).join('g').attr('class', 'lk')
      .each(function (e) {
        var g = d3.select(this);
        e.extra.forEach(function (q) { g.append('line').attr('class', 'link').attr('x1', e.x).attr('y1', e.y).attr('x2', q[0]).attr('y2', q[1]); });
      });
    var mk = gMarks.selectAll('g.mk').data(placed, function (e) { return e.id; }).join('g')
      .attr('class', function (e) { return 'mk t-' + e.case_type; })
      .attr('transform', function (e) { return 'translate(' + e.x + ',' + e.y + ')'; });
    mk.append('circle').attr('class', 'hit').attr('r', 7);
    mk.append('circle').attr('class', 'ring').attr('r', 7.5);
    mk.append('path').attr('class', 'shape-el').attr('d', function (e) { return shapePath(e, 3.6); }).each(function (e) {
      var st = shapeStyle(e).match(/(\w[\w-]*)="([^"]*)"/g);
      var el = d3.select(this);
      st.forEach(function (kv) { var m = kv.match(/(\w[\w-]*)="([^"]*)"/); el.attr(m[1], m[2]); });
      el.attr('vector-effect', 'non-scaling-stroke');
    });
    mk.append('text').attr('x', 6).attr('y', 3.5).text(function (e) { return e.n; });
    // secondary-site markers, small
    gLinks.selectAll('g.lk').each(function (e) {
      var g = d3.select(this);
      e.extra.forEach(function (q) { g.append('path').attr('transform', 'translate(' + q[0] + ',' + q[1] + ')').attr('class', 'sub').attr('d', shapePath(e, 2.2)).attr('fill', e.case_type === 'core' ? '#141414' : '#fff').attr('stroke', '#141414').attr('stroke-width', 0.8).attr('vector-effect', 'non-scaling-stroke'); });
    });

    // tooltip and clicks
    var tip = d3.select(mapEl).append('div').attr('class', 'tip').style('display', 'none');
    mk.on('mouseenter', function (ev, e) {
      tip.style('display', 'block').html('<b>' + esc(e.n + '. ' + e.label) + '</b><br>' + esc(e.dates) + ' · ' + esc(e.place));
    }).on('mousemove', function (ev) {
      var r = mapEl.getBoundingClientRect();
      var x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 12;
      if (x > r.width - 270) x = ev.clientX - r.left - 270;
      tip.style('left', x + 'px').style('top', y + 'px');
    }).on('mouseleave', function () { tip.style('display', 'none'); })
      .on('click', function (ev, e) { ev.stopPropagation(); select(e.id, false); });

    // zoom
    zoom = d3.zoom().scaleExtent([1, 24]).translateExtent([[0, 0], [W, H]]).on('zoom', function (ev) {
      k = ev.transform.k;
      gZoom.attr('transform', ev.transform);
      mk.attr('transform', function (e) { return 'translate(' + e.x + ',' + e.y + ') scale(' + (1 / k) + ')'; });
      gLinks.selectAll('path.sub').attr('transform', function () { var t = this.getAttribute('transform').match(/translate\(([^)]+)\)/)[1]; return 'translate(' + t + ') scale(' + (1 / k) + ')'; });
      svg.classed('labels', k >= 2.6);
    });
    svg.call(zoom).on('dblclick.zoom', null);
    var bar = d3.select(mapEl).append('div').attr('class', 'zoombar');
    bar.append('button').attr('type', 'button').attr('aria-label', 'Zoom in').text('+').on('click', function () { svg.transition().duration(300).call(zoom.scaleBy, 1.8); });
    bar.append('button').attr('type', 'button').attr('aria-label', 'Zoom out').text('−').on('click', function () { svg.transition().duration(300).call(zoom.scaleBy, 1 / 1.8); });
    bar.append('button').attr('type', 'button').attr('aria-label', 'Show the whole world').attr('title', 'Whole world').text('⌂').on('click', function () { svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity); });

    buildTimeline();
    bindFilters();
    apply();
    fromHash();
    window.addEventListener('hashchange', fromHash);
  }

  function matches(e, ignoreDecade) {
    if (!state.types.has(e.case_type)) return false;
    if (!state.adj && e.scope === 'adjacent') return false;
    if (state.svc && e.services.indexOf(state.svc) < 0) return false;
    if (state.ctx && e.context !== state.ctx) return false;
    if (state.harm && !e.harm) return false;
    if (state.vfy && !e.verified) return false;
    if (!ignoreDecade && state.decade != null && e.decade !== state.decade) return false;
    if (state.q && e._hay.indexOf(state.q) < 0) return false;
    return true;
  }

  function buildTimeline() {
    var t = $('timeline');
    t.innerHTML = '<button type="button" class="all" data-d="">All</button>' + DECADES.map(function (d) {
      return '<button type="button" data-d="' + d + '"><span class="bar"></span><span>' + decLabel(d) + '</span><span class="n"></span></button>';
    }).join('');
    t.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      var d = b.getAttribute('data-d');
      state.decade = d === '' || +d === state.decade ? null : +d;
      apply();
    });
  }

  function bindFilters() {
    $('q').addEventListener('input', function () { state.q = this.value.trim().toLowerCase(); apply(); });
    $('svc').addEventListener('change', function () { state.svc = this.value; apply(); });
    $('ctx').addEventListener('change', function () { state.ctx = this.value; apply(); });
    $('harm').addEventListener('change', function () { state.harm = this.checked; apply(); });
    $('adj').addEventListener('change', function () { state.adj = this.checked; apply(); });
    $('vfy').addEventListener('change', function () { state.vfy = this.checked; apply(); });
    document.querySelectorAll('.chip').forEach(function (c) {
      c.addEventListener('click', function () {
        var t = c.getAttribute('data-type');
        if (state.types.has(t)) state.types.delete(t); else state.types.add(t);
        c.setAttribute('aria-pressed', state.types.has(t) ? 'true' : 'false');
        apply();
      });
    });
    $('list').addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-id]'); if (b) select(b.getAttribute('data-id'), true);
    });
  }

  function apply() {
    var shown = events.filter(function (e) { return matches(e, false); });
    var shownSet = new Set(shown.map(function (e) { return e.id; }));
    gMarks.selectAll('g.mk').attr('display', function (e) { return shownSet.has(e.id) ? null : 'none'; });
    gZoom.selectAll('g.lk').attr('display', function (e) { return e.id === state.sel && shownSet.has(e.id) ? null : 'none'; });
    // timeline counts follow every filter except the decade
    var counts = {}; var max = 1;
    events.forEach(function (e) { if (matches(e, true)) counts[e.decade] = (counts[e.decade] || 0) + 1; });
    DECADES.forEach(function (d) { max = Math.max(max, counts[d] || 0); });
    document.querySelectorAll('#timeline button').forEach(function (b) {
      var d = b.getAttribute('data-d');
      b.setAttribute('aria-pressed', (d === '' ? state.decade == null : +d === state.decade) ? 'true' : 'false');
      if (d !== '') {
        var n = counts[+d] || 0;
        b.querySelector('.bar').style.height = Math.round(4 + 34 * n / max) + 'px';
        b.querySelector('.n').textContent = n;
      }
    });
    var sorted = shown.slice().sort(function (a, b) { return a.year - b.year || a.n - b.n; });
    $('list').innerHTML = sorted.map(function (e) {
      return '<li><button type="button" data-id="' + e.id + '"' + (state.sel === e.id ? ' aria-current="true"' : '') + '>' + iconSVG(e) +
        '<span class="no">' + e.n + '</span><span>' + esc(e.label) + '<span class="d">' + esc(e.dates) + ' · ' + esc(e.place) + (e.lat == null ? ' · not mapped' : '') + '</span></span></button></li>';
    }).join('');
    $('count').textContent = 'Showing ' + shown.length + ' of ' + events.length + ' events' + (state.decade != null ? ', ' + decLabel(state.decade) : '');
  }

  function select(id, fly) {
    var e = byId[id.toLowerCase()]; if (!e) return;
    state.sel = e.id;
    gMarks.selectAll('g.mk').classed('sel', function (d) { return d.id === e.id; }).filter(function (d) { return d.id === e.id; }).raise();
    var d = $('detail');
    d.hidden = false;
    d.innerHTML = '<button class="close" type="button" aria-label="Close">×</button>' +
      '<p class="eid">' + esc(e.id) + ' · ' + TYPE_LABEL[e.case_type] + (e.scope === 'adjacent' ? ' · adjacent case' : '') + '</p>' +
      '<h2>' + esc(e.title) + '</h2>' +
      '<p class="m">' + esc(e.dates) + ' · ' + esc(e.place) + ' · ' + esc(e.services.join(', ')) + '</p>' +
      '<p>' + esc(e.summary) + '</p>' +
      (e.gap ? '<h3>Why it stayed apart</h3><p>' + esc(e.gap) + '</p>' : '') +
      (e.joining ? '<h3>Who joined it</h3><p>' + esc(e.joining) + '</p>' : '') +
      '<p><a href="' + esc(e.url) + '">Full entry with sources →</a></p>';
    d.querySelector('.close').addEventListener('click', function () { d.hidden = true; state.sel = null; gMarks.selectAll('g.mk').classed('sel', false); history.replaceState(null, '', location.pathname); apply(); });
    if (history.replaceState) history.replaceState(null, '', '#' + e.id.toLowerCase());
    apply();
    var side = document.querySelector('.side'); if (side && side.scrollTo) side.scrollTo({ top: 0 });
    if (fly && e.x != null) {
      var kk = Math.max(k, 3.2);
      svg.transition().duration(650).call(zoom.transform, d3.zoomIdentity.translate(W / 2 - kk * e.x, H / 2 - kk * e.y).scale(kk));
    }
  }

  function fromHash() {
    var h = (location.hash || '').slice(1).toLowerCase();
    if (/^ag-\d+$/.test(h) && byId[h]) select(h, true);
    else if (/^d\d{4}$/.test(h)) { var d = +h.slice(1); if (DECADES.indexOf(d) >= 0) { state.decade = d; apply(); } }
  }
})();
