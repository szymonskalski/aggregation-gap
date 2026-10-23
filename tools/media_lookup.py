#!/usr/bin/env python3
"""media_lookup.py - look up openly licensed pictures for an entry, one query or one file at a time.

  python3 tools/media_lookup.py search "Lemoniz nuclear power plant" [N]   Commons search, first N files (default 8)
  python3 tools/media_lookup.py file "File:Central nuclear de Lemoiz.jpg" [DIR]   full record, and a 500 px copy in DIR
  python3 tools/media_lookup.py nasa "Deepwater Horizon oil spill" [N]       NASA Image and Video Library search
  python3 tools/media_lookup.py nasafile NASA_ID [DIR]                       full record and a copy in DIR

Prints JSON. Only public-domain, CC0, CC BY and CC BY-SA files pass ("ok": true). A Commons record also gives
the file's categories and flags a personality-rights notice or a deletion request on the page, and the
address of a 960 px copy for the site ("site_url"). The copy written to DIR is for looking at, not for publishing.
"""
import html, json, os, re, sys, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from media_shortlist import UA, OK_LICENCE, BAD_LICENCE, IMG, get, text, commons_search, commons_file, nasa  # noqa: E402

SITE_W = 960


def thumb(file_url, width, w):
    """Commons serves scaled copies at standard widths under /thumb/; a smaller original is used as it is."""
    m = re.match(r'(https://upload\.wikimedia\.org/wikipedia/commons)/(\w/\w\w)/(.+)$', file_url or '')
    if not m or (width and width <= w):
        return file_url
    name = m.group(3)
    tif = re.search(r'\.tiff?$', name, re.I)
    suffix = f'lossy-page1-{w}px-{name}.jpg' if tif else f'{w}px-{name}'
    return f'{m.group(1)}/thumb/{m.group(2)}/{name}/{suffix}'


def ok(lic):
    # a file offered under several licences may be reused under any one of them: GFDL alongside CC BY-SA is fine
    parts = [p.strip() for p in re.split(r';|\bor\b', lic or '') if p.strip()]
    return any(not BAD_LICENCE.search(p) and OK_LICENCE.search(p) for p in parts)


def save(url, folder, name):
    if not folder or not url:
        return ''
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, re.sub(r'[^\w.-]+', '_', name)[-90:])
    if not re.search(r'\.(jpe?g|png)$', path, re.I):
        path += '.jpg'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=60) as r, open(path, 'wb') as fh:
            fh.write(r.read())
        return path
    except Exception as e:
        return f'download failed: {e}'


def commons_record(title, folder=''):
    if not title.startswith('File:'):
        title = 'File:' + title
    f = commons_file(title)
    if not f:
        return {'title': title, 'error': 'file page not found'}
    page = get(f['page']).replace('&#95;', '_')
    cats = re.findall(r'<a href="/wiki/Category:[^"]+" title="Category:([^"]+)"', page.split('id="mw-normal-catlinks"')[-1][:20000]) if 'mw-normal-catlinks' in page else []
    f['categories'] = [html.unescape(c) for c in cats][:25]
    f['personality_rights_notice'] = bool(re.search(r'personality.rights', page, re.I))
    f['deletion_request'] = bool(re.search(r'(nominated for deletion|deletion request|Deletion_requests/File)', page, re.I))
    f['ok'] = ok(f['licence'])
    f['site_url'] = thumb(f['file'], f['width'], SITE_W)
    f['look_at'] = save(thumb(f['file'], f['width'], 500), folder, title[5:])
    return f


def nasa_record(nasa_id, folder=''):
    body = get('https://images-api.nasa.gov/search?' + urllib.parse.urlencode({'nasa_id': nasa_id}))
    try:
        it = json.loads(body)['collection']['items'][0]
    except Exception:
        return {'nasa_id': nasa_id, 'error': 'not found'}
    d = it['data'][0]
    assets = []
    try:
        assets = [x['href'] for x in json.loads(get('https://images-api.nasa.gov/asset/' + urllib.parse.quote(nasa_id)))['collection']['items']]
    except Exception:
        pass
    pick = lambda tag: next((a for a in assets if a.lower().endswith(f'~{tag}.jpg')), '')
    site = pick('large') or pick('medium') or pick('orig')
    return {
        'source': 'NASA Image and Video Library', 'nasa_id': nasa_id, 'title': d.get('title', ''),
        'page': 'https://images.nasa.gov/details/' + urllib.parse.quote(nasa_id),
        'author': d.get('secondary_creator') or d.get('photographer') or '', 'center': d.get('center', ''),
        'date': d.get('date_created', '')[:10], 'description': text(d.get('description', ''))[:1500],
        'keywords': d.get('keywords', [])[:15],
        'licence': 'Public domain (NASA); check the description for third-party material', 'licence_url': 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
        'ok': True, 'site_url': site.replace('http://', 'https://'), 'look_at': save((pick('medium') or pick('small') or site).replace('http://', 'https://'), folder, nasa_id + '.jpg'),
    }


def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    cmd, arg = sys.argv[1], sys.argv[2]
    extra = sys.argv[3] if len(sys.argv) > 3 else ''
    if cmd == 'search':
        n = int(extra or 8)
        out = []
        for t in commons_search(arg)[:n]:
            f = commons_file(t)
            if f:
                out.append({k: f[k] for k in ('title', 'page', 'licence', 'author', 'date', 'width', 'height')} | {'description': f['description'][:240], 'ok': ok(f['licence'])})
        print(json.dumps(out, ensure_ascii=False, indent=1))
    elif cmd == 'file':
        print(json.dumps(commons_record(arg, extra), ensure_ascii=False, indent=1))
    elif cmd == 'nasa':
        n = int(extra or 8)
        print(json.dumps([{k: f[k] for k in ('title', 'page', 'date', 'description')} | {'nasa_id': f['page'].rsplit('/', 1)[-1]} for f in nasa(arg)[:n]], ensure_ascii=False, indent=1))
    elif cmd == 'nasafile':
        print(json.dumps(nasa_record(arg, extra), ensure_ascii=False, indent=1))
    else:
        print(__doc__); sys.exit(1)


if __name__ == '__main__':
    main()
