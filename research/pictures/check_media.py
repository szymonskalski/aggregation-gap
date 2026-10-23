#!/usr/bin/env python3
"""check_media.py - check a batch of chosen pictures for form and licence.

Usage: python3 check_media.py batches/m_01.json out/m_01.json
Checks that every entry of the batch is present, that each has at most two pictures, that each picture comes from
Wikimedia Commons or NASA with a site address on their servers, carries an acceptable licence, a caption of at most
30 words and an alt text of at most 25 words, an author, a kind from the list, and a copy that exists in look/.
It cannot check what the picture shows; that is the reader's task.
"""
import json, os, re, sys

OK_LICENCE = re.compile(r'(public domain|^pd\b|pd-|cc0|cc[- ]by(-sa)?[- ]\d|cc[- ]by(-sa)?$)', re.I)
BAD_LICENCE = re.compile(r'(\bnc\b|non-?commercial|\bnd\b|no ?deriv|fair use|gfdl)', re.I)
KINDS = {'photo', 'satellite', 'aerial', 'document', 'period map'}
AGENCY = re.compile(r'\b(reuters|associated press|\bap photo|afp|getty|un photo|united nations photo|epa\b|xinhua|tass|ria novosti|anadolu|zentralbild|bild 183)\b', re.I)
BANNED = re.compile(r'\b(pictured|seen here|iconic|stunning|striking|dramatic|haunting|poignant)\b', re.I)
HOSTS = ('https://upload.wikimedia.org/', 'https://images-assets.nasa.gov/')
PAGES = ('https://commons.wikimedia.org/wiki/', 'https://images.nasa.gov/details/')


def main():
    src = [e['id'] for e in json.load(open(sys.argv[1]))]
    out = json.load(open(sys.argv[2]))
    here = os.path.dirname(os.path.abspath(sys.argv[2]))
    problems = 0
    def bad(msg):
        nonlocal problems
        problems += 1
        print(msg)
    ids = [e.get('id') for e in out]
    for i in src:
        if i not in ids:
            bad(f'{i}: missing from the output')
    for i in ids:
        if i not in src:
            bad(f'{i}: not in the batch')
    if [i for i in ids if i in src] != [i for i in src if i in ids]:
        bad('entries not in the batch order')
    seen = set()
    for e in out:
        imgs = e.get('images') or []
        if len(imgs) > 2:
            bad(f'{e.get("id")}: more than two pictures')
        if not imgs and not e.get('note'):
            bad(f'{e.get("id")}: no picture and no note saying why')
        for k, m in enumerate(imgs, 1):
            tag = f'{e.get("id")} picture {k}'
            for f in ('source_page', 'site_url', 'kind', 'caption', 'alt', 'author', 'licence', 'look_at', 'relevance'):
                if not str(m.get(f) or '').strip():
                    bad(f'{tag}: {f} is empty')
            if not str(m.get('source_page', '')).startswith(PAGES):
                bad(f'{tag}: source_page is not a Commons or NASA page')
            if not str(m.get('site_url', '')).startswith(HOSTS):
                bad(f'{tag}: site_url is not on upload.wikimedia.org or images-assets.nasa.gov')
            lic = str(m.get('licence', ''))
            if BAD_LICENCE.search(lic) or not OK_LICENCE.search(lic):
                bad(f'{tag}: licence "{lic}" not acceptable')
            if re.search(r'cc', lic, re.I) and not str(m.get('licence_url', '')).startswith('https://creativecommons.org/'):
                bad(f'{tag}: a Creative Commons licence needs its deed link in licence_url')
            if m.get('kind') not in KINDS:
                bad(f'{tag}: kind "{m.get("kind")}" not one of {sorted(KINDS)}')
            if len(str(m.get('caption', '')).split()) > 30:
                bad(f'{tag}: caption longer than 30 words')
            if len(str(m.get('alt', '')).split()) > 25:
                bad(f'{tag}: alt longer than 25 words')
            for f in ('caption', 'alt'):
                if BANNED.search(str(m.get(f, ''))):
                    bad(f'{tag}: {f} uses "{BANNED.search(str(m.get(f))).group(0)}"')
            if AGENCY.search(str(m.get('author', '')) + ' ' + str(m.get('credit_source', ''))):
                bad(f'{tag}: author names a news or UN agency')
            if 'Commons' in str(m.get('source', '')) and not (m.get('width') and m.get('height')):
                bad(f'{tag}: width and height missing')
            p = str(m.get('look_at', ''))
            if not os.path.isabs(p):
                p = os.path.join(here, '..', p)
            if not os.path.exists(p):
                bad(f'{tag}: the copy you looked at ({m.get("look_at")}) does not exist')
            if m.get('source_page') in seen:
                bad(f'{tag}: the same picture is used twice in this batch')
            seen.add(m.get('source_page'))
    print('PROBLEMS:', problems)
    sys.exit(1 if problems else 0)


if __name__ == '__main__':
    main()
