#!/usr/bin/env python3
"""media_shortlist.py - candidate images for each register entry, with licence data.

Searches Wikimedia Commons (search pages and file pages, which carry the licence in machine-readable
markup) and the NASA Image and Video Library. Keeps only public-domain, CC0, CC BY and CC BY-SA files
and records for each: title, source page, file address, author, date, licence and licence link,
and the source's own description. Choosing among the candidates, and checking that an image shows the
event's place and time, is left to a reader.

Usage: python3 tools/media_shortlist.py data/events.seed.csv research/media_candidates.json
Resumable: entries already in the output file are skipped.
"""
import csv, html, json, os, re, sys, time, urllib.parse, urllib.request

UA = 'AggregationGapAtlas/1.0 (https://github.com/szymonskalski/aggregation-gap)'
PAUSE = 0.6
OK_LICENCE = re.compile(r'(public domain|^pd\b|pd-|cc0|cc[- ]by(-sa)?[- ]\d|cc[- ]by(-sa)?$)', re.I)
BAD_LICENCE = re.compile(r'(\bnc\b|non-?commercial|\bnd\b|no ?deriv|fair use|gfdl)', re.I)
IMG = re.compile(r'\.(jpe?g|png|tiff?|webp)$', re.I)
GENERIC = set('The A An And Of In On At To For With By From Into Over Under After Before During Near Against'.split())


def get(url, tries=3):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                body = r.read().decode('utf-8', 'replace')
            time.sleep(PAUSE)
            return body
        except Exception as e:
            time.sleep(PAUSE * (4 + 6 * k))
            err = e
    print('  fetch failed:', url[:120], err, file=sys.stderr)
    return ''


def text(s):
    s = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', s, flags=re.S)
    s = re.sub(r'<br\s*/?>', ' ', s)
    s = re.sub(r'<[^>]+>', ' ', s)
    return re.sub(r'\s+', ' ', html.unescape(s)).strip()


def proper_nouns(strings, corpus=''):
    """Capitalised names in the strings. A capitalised word that the entry also uses in lower case
    ("Sabotage", "Destruction") is an ordinary word opening a title, not a name, and is dropped."""
    lower = set(re.findall(r"\b[a-z][\w'’-]*", corpus))
    out = []
    for s in strings:
        for m in re.finditer(r"\b([A-Z][\w'’.-]*(?:\s+(?:[A-Z][\w'’.-]*|de|du|la|of|al|el))*)", s or ''):
            words = [w for w in m.group(1).split() if w not in GENERIC and w.lower() not in lower]
            while words and words[-1] in ('de', 'du', 'la', 'of', 'al', 'el'):
                words.pop()
            p = ' '.join(words)
            if len(p) > 2 and not any(p.lower() in o.lower() for o in out):
                out = [o for o in out if o.lower() not in p.lower()] + [p]
    return out


def queries(e):
    corpus = ' '.join(e[k] for k in ('summary', 'records', 'gap', 'joining'))
    q = []
    m = re.search(r'\(([^)]+)\)', e['place'])
    if m:
        q.extend(proper_nouns([m.group(1)], corpus)[:1])
    nouns = proper_nouns([e['label'], e['title']], corpus)
    if nouns:
        q.append(' '.join(nouns[:2]))
        q.extend(nouns[:2])
    first = re.split(r'[/(,]', e['place'])[0].strip()
    last = re.sub(r'[^a-z ]', '', e['label'].lower()).split(' ')[-1]
    if first:
        q.append(first + ' ' + last)
    q.insert(0, e['label'])
    seen, out = set(), []
    for x in q:
        x = x.strip()
        if x and x.lower() not in seen:
            seen.add(x.lower()); out.append(x)
    return out[:5]


def commons_search(q):
    url = 'https://commons.wikimedia.org/w/index.php?' + urllib.parse.urlencode(
        {'search': q, 'title': 'Special:Search', 'ns6': 1, 'fulltext': 1, 'limit': 20})
    page = get(url)
    titles = re.findall(r'class="mw-search-result-heading"><a href="/wiki/(File:[^"]+)"', page)
    return [urllib.parse.unquote(t) for t in titles if IMG.search(urllib.parse.unquote(t))]


def td_after(page, ident):
    m = re.search(r'id="%s"[^>]*>.*?</td>\s*<td[^>]*>(.*?)</td>' % ident, page, flags=re.S)
    return text(m.group(1)) if m else ''


def commons_file(title):
    page_url = 'https://commons.wikimedia.org/wiki/' + urllib.parse.quote(title.replace(' ', '_'))
    page = get(page_url).replace('&#95;', '_')
    if not page:
        return None
    lic = [text(x) for x in re.findall(r'class="licensetpl_short"[^>]*>(.*?)</span>', page, flags=re.S)]
    link = re.findall(r'class="licensetpl_link"[^>]*>(.*?)</span>', page, flags=re.S)
    full = re.search(r'class="fullImageLink"[^>]*>\s*<a href="([^"]+)"', page)
    # the original's size is the one given with the file size; "Size of this preview" comes first on the page
    dims = re.search(r'(\d[\d,]*) × (\d[\d,]*) pixels, file size', page) or re.search(r'(\d[\d,]*) × (\d[\d,]*) pixels', page)
    return {
        'source': 'Wikimedia Commons', 'title': title, 'page': page_url,
        'file': html.unescape(full.group(1)).split('?')[0] if full else '',
        'width': int(dims.group(1).replace(',', '')) if dims else None,
        'height': int(dims.group(2).replace(',', '')) if dims else None,
        'author': td_after(page, 'fileinfotpl_aut')[:200],
        'date': td_after(page, 'fileinfotpl_date')[:80],
        'description': td_after(page, 'fileinfotpl_desc')[:400],
        'credit_source': td_after(page, 'fileinfotpl_src')[:200],
        'licence': '; '.join(dict.fromkeys(lic))[:120],
        'licence_url': text(link[0]) if link else '',
    }


def nasa(q):
    url = 'https://images-api.nasa.gov/search?' + urllib.parse.urlencode({'q': q, 'media_type': 'image'})
    body = get(url)
    try:
        items = json.loads(body)['collection']['items'][:6]
    except Exception:
        return []
    out = []
    for it in items:
        d = it['data'][0]
        out.append({
            'source': 'NASA Image and Video Library', 'title': d.get('title', ''),
            'page': 'https://images.nasa.gov/details/' + urllib.parse.quote(d.get('nasa_id', '')),
            'file': (it.get('links') or [{}])[0].get('href', ''), 'width': None, 'height': None,
            'author': d.get('secondary_creator') or d.get('center', ''), 'date': d.get('date_created', '')[:10],
            'description': text(d.get('description', ''))[:400], 'credit_source': d.get('center', ''),
            'licence': 'Public domain (NASA; check for third-party content)', 'licence_url': 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
        })
    return out


def main():
    src, dst = sys.argv[1], sys.argv[2]
    csv.field_size_limit(10 ** 8)
    entries = list(csv.DictReader(open(src, encoding='utf-8')))
    done = json.load(open(dst)) if os.path.exists(dst) else {}
    for n, e in enumerate(entries):
        if e['id'] in done:
            continue
        qs = queries(e)
        cands, seen = [], set()
        for q in qs[:3]:
            for t in commons_search(q)[:6]:
                if t in seen:
                    continue
                seen.add(t)
                if len(seen) > 8:
                    break
                f = commons_file(t)
                if not f or not f['licence'] or BAD_LICENCE.search(f['licence']) or not OK_LICENCE.search(f['licence']):
                    continue
                if f['width'] and f['width'] < 500:
                    continue
                f['query'] = q
                cands.append(f)
            if len(cands) >= 6 or len(seen) > 8:
                break
        if int(e['year'] or 0) >= 1960:
            for q in qs[:1]:
                for f in nasa(q)[:4]:
                    f['query'] = q
                    cands.append(f)
        done[e['id']] = {'queries': qs, 'candidates': cands}
        json.dump(done, open(dst, 'w'), ensure_ascii=False, indent=1)
        print(f"{n + 1}/{len(entries)} {e['id']} {len(cands)} candidates  {qs}", flush=True)


if __name__ == '__main__':
    main()
