#!/usr/bin/env python3
"""check_chrono.py - check extracted chronology rows against the entry text.

Usage: python3 check_chrono.py batches/c_3.json out/c_3.json

Every row must:
  - have kind in the allowed set and a date in the form YYYY, YYYY-MM or YYYY-MM-DD (date_end the same, if present)
  - have a date_text that appears word for word in the entry (any field, including dates and title)
  - have a date whose year appears in date_text, or (for a day and month alone) in the entry's dates field
    or in the same field within 400 characters before the date
  - name a holder found in the entry text (holder "event" is reserved for the disruption itself)
  - name a field that exists, and a note of at most 14 words
Exit code 0 when no problem remains.
"""
import json, re, sys

KINDS = {'event', 'recorded', 'reported', 'joined', 'attributed', 'denied', 'finding', 'other'}
FIELDS = {'title', 'dates', 'summary', 'records', 'gap', 'joining', 'harm_found_later'}
DATE = re.compile(r'^\d{4}(-\d{2}(-\d{2})?)?$')
STOP = {'the', 'of', 'and', 'for', 'its', 'own', 'their', 'with', 'from', 'that', 'this', 'other', 'national', 'state', 'local'}


def norm(s):
    return re.sub(r'\s+', ' ', (s or '').replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"')).strip().lower()


def main():
    src = {e['id']: e for e in json.load(open(sys.argv[1]))}
    out = json.load(open(sys.argv[2]))
    problems = 0
    seen = set()
    for ent in out:
        i = ent.get('id')
        if i not in src:
            print(f'{i}: not in the batch'); problems += 1; continue
        seen.add(i)
        e = src[i]
        text = norm(' '.join(str(e.get(k, '')) for k in FIELDS | {'place'}))
        for n, r in enumerate(ent.get('rows', [])):
            tag = f'{i} row {n + 1}'
            k = r.get('kind')
            if k not in KINDS:
                print(f'{tag}: kind "{k}" not allowed'); problems += 1
            d = str(r.get('date', ''))
            if not DATE.match(d):
                print(f'{tag}: date "{d}" not YYYY, YYYY-MM or YYYY-MM-DD'); problems += 1
            de = r.get('date_end')
            if de and not DATE.match(str(de)):
                print(f'{tag}: date_end "{de}" malformed'); problems += 1
            dt = norm(r.get('date_text'))
            if not dt or dt not in text:
                print(f'{tag}: date_text "{r.get("date_text")}" not found word for word in the entry'); problems += 1
            elif d[:4] not in dt and not re.search(d[:3] + r'0s', dt):
                # a day and month without a year: the year must be stated in the entry's dates field,
                # or in the same field within 400 characters before the date
                ftext = norm(e.get(r.get('field'), ''))
                pos = ftext.find(dt)
                near = ftext[max(0, pos - 400):pos] if pos >= 0 else ''
                if d[:4] not in norm(e.get('dates', '')) and d[:4] not in near:
                    print(f'{tag}: year {d[:4]} is not in date_text "{r.get("date_text")}", in the dates field, or just before it in the same field'); problems += 1
            h = norm(r.get('holder'))
            if h != 'event':
                words = [w for w in re.findall(r"[a-z0-9][a-z0-9.&'-]{2,}", h) if w not in STOP]
                missing = [w for w in words if w not in text]
                if not words or missing:
                    print(f'{tag}: holder "{r.get("holder")}" not found in the entry ({", ".join(missing) or "empty"})'); problems += 1
            if r.get('field') not in FIELDS:
                print(f'{tag}: field "{r.get("field")}" unknown'); problems += 1
            if len(str(r.get('note', '')).split()) > 14:
                print(f'{tag}: note longer than 14 words'); problems += 1
        dates = [str(r.get('date', '')) for r in ent.get('rows', [])]
        if dates != sorted(dates):
            print(f'{i}: rows not in date order'); problems += 1
        if not any(r.get('kind') == 'event' for r in ent.get('rows', [])):
            print(f'{i}: no row of kind "event"'); problems += 1
    for i in src:
        if i not in seen:
            print(f'{i}: missing from the output'); problems += 1
    print('PROBLEMS:', problems)
    sys.exit(1 if problems else 0)


if __name__ == '__main__':
    main()
