#!/usr/bin/env python3
"""check_recode.py out_A.json - every entry coded once, into one of the three classes, with words found in the entry."""
import json, os, re, sys

D = os.path.dirname(os.path.abspath(__file__))
NEW = {'false-alarm', 'wrongly-blamed', 'still-open'}
norm = lambda s: re.sub(r'\s+', ' ', (s or '').replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"')).strip().lower()
src = json.load(open(os.path.join(D, 'entries.json')))
out = json.load(open(sys.argv[1]))
by = {e['id']: e for e in src}
problems = 0
ids = [o.get('id') for o in out]
for e in src:
    if e['id'] not in ids:
        print(e['id'], 'missing'); problems += 1
for o in out:
    e = by.get(o.get('id'))
    if not e:
        print(o.get('id'), 'not in entries.json'); problems += 1; continue
    if o.get('new') not in NEW:
        print(o['id'], 'new class', o.get('new'), 'not one of', sorted(NEW)); problems += 1
    text = norm(' '.join(e.get(k, '') for k in ('summary', 'records', 'gap', 'joining', 'harm_found_later')))
    w = norm(o.get('words'))
    parts = [p.strip(' .') for p in re.split(r'\s*(?:\.\.\.|…|\|)\s*', w) if p.strip(' .')]
    if not parts or any(p not in text for p in parts):
        print(o['id'], 'words not found word for word in the entry'); problems += 1
if len(ids) != len(set(ids)):
    print('an entry is coded twice'); problems += 1
print('PROBLEMS:', problems)
sys.exit(1 if problems else 0)
