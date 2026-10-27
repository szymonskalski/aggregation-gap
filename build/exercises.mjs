// The exercises: decision-forcing cases built on entries of the register. Each file in data/exercises/ names
// an entry, the institutions the player sits in, and the points at which each had to act. Everything the
// player is shown as fact is either a row of the entry's chronology (by its seq number) or words copied from
// the entry itself; the words are checked against the entry here, and an exercise that fails is left out.
// The options offered at each point are hypothetical moves, and only one of them is marked as what was done.
import fs from 'node:fs';
import path from 'node:path';

export const MOVES = ['recorded', 'reported', 'finding', 'attributed', 'denied', 'joined', 'waited'];
export const MOVE_WORD = {
  event: 'the event', recorded: 'recorded it', reported: 'reported it or made it public', finding: 'made a finding',
  attributed: 'named an attacker or a hostile cause', denied: 'denied or disputed it', joined: 'put the records together',
  waited: 'waited for more', other: 'another step',
};
const norm = s => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const stop = s => (/[.!?'"’”)]$/.test(s) ? s : `${s}.`);

// events: the entries as read (before typographer's quotes); chrono: the grouped chronology rows; smart: the
// display quotes of the build
export function loadExercises(root, events, chrono, warn, smart) {
  const dir = path.join(root, 'data', 'exercises');
  if (!fs.existsSync(dir)) return [];
  const byId = new Map(events.map(e => [e.id, e]));
  const out = [];
  for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.json')).sort()) {
    let x;
    try { x = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (err) { warn(`Exercise ${f}: ${err.message}; left out`); continue; }
    const e = byId.get(String(x.id || '').toUpperCase());
    if (!e) { warn(`Exercise ${f}: ${x.id} is not a published entry; left out`); continue; }
    const rows = chrono[e.id] || [];
    const text = norm([e.summary, e.records, e.gap, e.joining, e.harm].join(' '));
    const problems = [];
    const item = (it, where) => {
      if (typeof it === 'number') {
        const r = rows.find(row => row.seq === it);
        if (!r) { problems.push(`${where}: no chronology row ${it}`); return null; }
        return { date: r.shown, who: r.holder, text: r.note, kind: r.kind };
      }
      if (it && typeof it.q === 'string') {
        const parts = it.q.split(/\s*(?:\.\.\.|…)\s*/).map(p => norm(p).replace(/[.\s]+$/, '')).filter(Boolean);
        if (!parts.length || parts.some(p => !text.includes(p))) { problems.push(`${where}: words not found in the entry: "${it.q.slice(0, 70)}"`); return null; }
        let who = it.who || it.holder || '', body = it.q.trim();
        // a holder's line from the entry ("Customs: the detained fruit.") is shown as holder and words
        const m = !who && body.match(/^([^:.;]{2,90}):\s+(.+)$/);
        if (m) { who = m[1]; body = m[2]; }
        return { date: it.when || '', who: smart(who), text: smart(stop(cap(body))), kind: it.kind || '' };
      }
      problems.push(`${where}: neither a row number nor words from the entry`);
      return null;
    };
    const items = (list, where) => (Array.isArray(list) ? list : []).map((it, k) => item(it, `${where} ${k + 1}`)).filter(Boolean);
    const points = (x.points || []).map((p, i) => {
      const at = `point ${i + 1}`;
      const did = item(p.did, `${at}, what was done`);
      if (did && typeof p.did === 'object' && !p.did.kind) problems.push(`${at}: what was done needs a kind`);
      const opts = (p.options || []).map(o => ({ text: smart(String(o.text || '')), kind: o.kind, actual: !!o.actual }));
      const actual = opts.findIndex(o => o.actual);
      if (opts.length < 2 || opts.length > 5) problems.push(`${at}: needs two to five options`);
      if (opts.filter(o => o.actual).length !== 1) problems.push(`${at}: exactly one option must be marked as what was done`);
      opts.forEach((o, k) => { if (!MOVES.includes(o.kind)) problems.push(`${at}, option ${k + 1}: kind "${o.kind}" is not one of ${MOVES.join(', ')}`); });
      if (did && actual >= 0 && opts[actual].kind !== did.kind) problems.push(`${at}: the option marked as done is "${opts[actual].kind}" but the record says "${did.kind}"`);
      if (!p.as || !p.question) problems.push(`${at}: needs "as" and "question"`);
      return {
        as: smart(p.as || ''), when: p.when ? smart(p.when) : did ? (did.date || 'Undated in the record') : '', question: smart(p.question || ''),
        before: items(p.before, `${at}, before`), options: opts.map(({ text, kind }) => ({ text, kind })), actual,
        did, did_q: items(p.did_q, `${at}, what was done`), unknown: items(p.unknown, `${at}, unknown`), then: items(p.then, `${at}, then`),
      };
    });
    if (!points.length) problems.push('no points');
    if (problems.length) { problems.forEach(p => warn(`Exercise ${f}: ${p}`)); warn(`Exercise ${f} left out`); continue; }
    out.push({ id: e.id, no: x.no || out.length + 1, title: smart(x.title || e.label), period: smart(x.period || e.dates), points });
  }
  return out.sort((a, b) => a.no - b.no);
}
