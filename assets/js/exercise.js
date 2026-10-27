// The player of an exercise: one point of decision at a time, then what was done, what the player could not
// have known, and what followed; at the end the debrief, with the player's minutes beside the record's.
// Nothing is stored: the minutes live on this page until it is closed.
(function () {
  'use strict';
  const D = JSON.parse(document.getElementById('x-data').textContent);
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const LETTER = 'ABCDE';
  const box = $('#x-points');
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let picks = [];

  document.querySelectorAll('.js-only').forEach(el => { el.hidden = false; });

  const mk = kind => (kind && D.marks[kind] ? `<span class="x-mk" title="${esc(D.words[kind] || '')}">${D.marks[kind]}</span>` : '');
  const item = it => `<li class="x-it${it.kind === 'event' ? ' x-ev' : ''}"><span class="x-d">${mk(it.kind)}${esc(it.date)}</span>` +
    `<span class="x-who">${esc(it.who || (it.kind === 'event' ? 'The event' : ''))}</span><span class="x-tx">${esc(it.text)}</span></li>`;
  const list = (items, cls) => (items && items.length ? `<ul class="x-file${cls ? ' ' + cls : ''}">${items.map(item).join('')}</ul>` : '');
  const go = el => { el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' }); el.focus({ preventScroll: true }); };

  function point(i) {
    const p = D.points[i];
    const sec = document.createElement('section');
    sec.className = 'x-point';
    sec.id = `point-${i + 1}`;
    sec.setAttribute('aria-labelledby', `ph-${i + 1}`);
    sec.innerHTML = `<header class="x-ph"><h2 id="ph-${i + 1}" tabindex="-1">Point ${i + 1}<span> of ${D.points.length}</span></h2><p class="x-when">${esc(p.when)}</p></header>
<p class="x-seat">You are <b>${esc(p.as)}</b>.</p>
${p.before.length ? `<h3 class="x-h">Before you</h3>${list(p.before)}` : ''}
<fieldset class="x-opts"><legend>${esc(p.question)}</legend>
${p.options.map((o, k) => `<label class="x-opt"><input type="radio" name="opt-${i}" value="${k}"><span class="x-l" aria-hidden="true">${LETTER[k]}</span><span class="x-ot">${esc(o.text)}</span><span class="x-tag" hidden></span></label>`).join('')}
</fieldset>
<label class="x-minute"><span>Your minute <i>(optional)</i></span><textarea rows="2" maxlength="600" placeholder="The reason for your move"></textarea></label>
<p class="x-act"><button type="button" class="button" disabled>Decide</button><span class="x-hint">Choose a move first</span></p>
<div class="x-after"></div>`;
    box.appendChild(sec);
    const btn = sec.querySelector('.x-act button'), hint = sec.querySelector('.x-hint');
    sec.querySelectorAll('input[type="radio"]').forEach(r => r.addEventListener('change', () => { btn.disabled = false; hint.hidden = true; }));
    btn.addEventListener('click', () => decide(i, sec));
    go(sec.querySelector('h2'));
  }

  function decide(i, sec) {
    const p = D.points[i];
    const chosen = sec.querySelector('input[type="radio"]:checked');
    if (!chosen) return;
    const k = +chosen.value;
    const ta = sec.querySelector('textarea');
    const minute = ta.value.trim();
    picks[i] = { k, minute };
    sec.classList.add('done');
    sec.querySelectorAll('input').forEach(el => { el.disabled = true; });
    sec.querySelector('.x-act').remove();
    const lab = sec.querySelector('.x-minute');
    if (minute) lab.outerHTML = `<p class="x-yours"><span>Your minute</span>${esc(minute)}</p>`;
    else lab.remove();
    sec.querySelectorAll('.x-opt').forEach((el, j) => {
      const tags = [];
      if (j === k) { tags.push('your move'); el.classList.add('yours'); }
      if (j === p.actual) { tags.push('what was done'); el.classList.add('theirs'); }
      const t = el.querySelector('.x-tag');
      if (tags.length) { t.textContent = tags.join(' · '); t.hidden = false; }
    });
    const after = sec.querySelector('.x-after');
    const last = i + 1 === D.points.length;
    after.innerHTML = `<div class="x-did" tabindex="-1"><p class="x-stamp">What was done</p>${list([p.did].concat(p.did_q))}</div>
${p.unknown.length ? `<div class="x-unk"><h3 class="x-h">Unknown to you at the time</h3>${list(p.unknown)}</div>` : ''}
${p.then.length ? `<h3 class="x-h">What followed</h3>${list(p.then)}` : ''}
<p class="x-act"><button type="button" class="button">${last ? 'To the debrief' : 'Next point'}</button></p>`;
    after.querySelector('.x-act button').addEventListener('click', ev => {
      ev.currentTarget.parentNode.remove();
      if (last) debrief(); else point(i + 1);
    });
    go(after.querySelector('.x-did'));
  }

  function debrief() {
    const used = new Set();
    $('#x-mins').innerHTML = D.points.map((p, i) => {
      const y = p.options[picks[i].k], t = p.options[p.actual];
      used.add(y.kind); used.add(t.kind);
      return `<tr><td><b>${i + 1}.</b> ${esc(p.when)}<span class="x-as">${esc(p.as)}</span></td>` +
        `<td>${mk(y.kind)}${esc(y.text)}${picks[i].minute ? `<span class="x-m">“${esc(picks[i].minute)}”</span>` : ''}</td>` +
        `<td>${mk(t.kind)}${esc(t.text)}<span class="x-m">${esc(p.did.text)}</span></td></tr>`;
    }).join('');
    const order = ['recorded', 'reported', 'finding', 'attributed', 'denied', 'joined', 'waited'];
    $('#x-key').innerHTML = order.filter(k => used.has(k)).map(k => `<li>${D.marks[k]}${esc(D.words[k])}</li>`).join('');
    const d = $('#x-debrief');
    d.hidden = false;
    go(d.querySelector('h2'));
  }

  $('#x-begin').addEventListener('click', ev => {
    ev.currentTarget.parentNode.hidden = true;
    point(0);
  });
  $('#x-again').addEventListener('click', () => {
    picks = [];
    box.innerHTML = '';
    $('#x-debrief').hidden = true;
    point(0);
  });
})();
