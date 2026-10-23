# Brief: pictures for the Aggregation Gap register

The register (an online atlas, https://szymonskalski.github.io/aggregation-gap/) describes disruptions of civilian services since 1945 in which several institutions each recorded one part of what happened. Each entry page already has a chronology and a detail map. We now add up to two pictures per entry, from openly licensed sources only, each with a caption and a full credit line. You choose the pictures for one batch of entries.

Working folder: `/tmp/claude-0/-home-claude/f827d55f-71c0-5ac4-9168-2237972221a3/scratchpad/media/`
Tool: `python3 /home/claude/aggregation-gap/tools/media_lookup.py` (run it with no arguments to see its commands).


**Requests.** Reach Wikimedia and NASA only through the tool, or with curl using the tool's User-Agent (`AggregationGapAtlas/1.0 (https://github.com/szymonskalski/aggregation-gap)`). Never put an email address, a name or any other personal detail into a request, a header or a query.


**Period maps.** A map made at the time by a government shows the place as a photograph would when it shows the physical site or works the entry describes (a dam, drainage canals, a pipeline route); it qualifies on that ground. A map that presents an assessment, an attribution or a casualty count is a document of that assessment, and qualifies only if the entry itself names the assessment.


**UN bodies.** A picture that a UN-system body has itself released under CC BY or CC BY-SA on its own channel (for example the IAEA Imagebank on Flickr) is acceptable, above all where the entry names that body as a holder of the record. UN Photo and news-agency pictures remain excluded.

## What earns a place

A picture belongs with an entry only if it shows one of these:
1. the facility, site, structure, vessel, aircraft, pipeline, cable landing, plant or piece of equipment the entry names (at any date, if the caption gives the picture's date);
2. the event itself or its physical aftermath: damage, fire, spill, smoke, a wreck, a breach;
3. a satellite or aerial view that shows the event or the named site (NASA Earth Observatory and astronaut photographs of spills, fires, floods, dams, smoke plumes);
4. a document of the record that the entry names (a page of a report, memorandum, notice, telegram, where the entry itself names that report or record, and showing the part that carries the record, not a cover or a scale), or a map made at the time of the event by a body the entry names or a government of the period.

Not enough: a general view of the city, region or country; a landscape; a flag, coat of arms, logo or seal; a portrait of an official; a modern map or locator map made for Wikipedia (the site draws its own maps); a picture of the same kind of object somewhere else ("a typical substation"); anything where you must explain why it is relevant. **No picture is the normal outcome when nothing fits.** Never pad. Most entries will end with zero or one picture.

## What is never used

- Pictures of dead or injured people, or of people in distress.
- Pictures in which a private individual is identifiable (a face that can be recognized, a name visible). Public officials in their public role are acceptable only where the entry names them and the picture shows the act the entry describes; in practice, prefer pictures without people.
- Anything whose licence is not public domain, CC0, CC BY or CC BY-SA (the tool marks these `"ok": true`). No NC or ND licences, no fair use, no GFDL-only files.
- Files whose page shows a deletion request or a personality-rights notice (the tool flags both).
- News-agency or UN pictures (Reuters, AP, AFP, Getty, UN Photo, EPA, Xinhua, TASS, RIA Novosti, the East German ADN-Zentralbild, that is Bundesarchiv Bild 183, and the like), even if a copy sits on Commons under a free licence claim. Check `author` and `credit_source`.
- Pictures whose original is narrower than 500 pixels (too small for the site).
- Files whose free-licence claim looks doubtful: a press photo uploaded as "own work", a screenshot of a television broadcast, a newspaper scan of recent date.

## How to work, entry by entry

1. Read the entry (`title`, `dates`, `place`, `summary`, `records`, `gap`, `joining`).
2. Look at the `shortlist` already gathered for the entry (it may be empty or mostly off-topic; judge each candidate by its title, date and description).
3. Search for what the entry names: the facility, vessel, site or place and the event, in English and in the local language (`search "Kakhovka Dam"`, `search "Nova Kakhovka dam destruction"`, `search "Каховська ГЕС"`). For events visible from space, also `nasa "..."`. At most four searches per entry; stop earlier once you have a clear choice or a clear "nothing fits".
4. For each picture you are considering, run `file "File:..." look` (or `nasafile NASA_ID look`), which writes a 500 px copy into the `look/` folder, and **open that copy with the Read tool and look at it.** Confirm that it shows what you think, and that nothing in it breaks the rules above. Do not select a picture you have not looked at.
5. Choose at most two, preferring pictures from the time of the event and pictures that show different things (the site and the damage; the event and the document).

Run the tool one command at a time (it paces itself so as not to burden Wikimedia). Wikimedia sometimes answers with HTTP 429 when several readers fetch at once; if a download fails, wait and retry the same command rather than skipping the look.

## The caption, the alt text and the credit

- `caption`: one sentence, at most 30 words, saying what the picture shows, where, and when it was made, in plain American English: "The Lemóniz nuclear power plant from the southwest, 2006." "Smoke from the fires at Buncefield depot, seen from the International Space Station, 11 December 2005." Every fact in it must come from the file's own title, description, date or categories, or from the entry's text. Translate a non-English description faithfully. Give the picture's date as the source gives it; if the source gives none, say nothing about the date and do not guess. No "pictured", "seen here", "iconic", no judgment, no explanation of why the picture matters.
- `alt`: a short plain description of what is visible, for readers who cannot see it (at most 25 words).
- `author`: as the source credits the author or creator (e.g. "Jose A. Solís (Mirir)", "U.S. Navy photo by Mass Communication Specialist 2nd Class J. Smith", "NASA Earth Observatory / Joshua Stevens"). For NASA, take the photographer or center from the record.
- `licence` and `licence_url`: as the tool gives them ("CC BY-SA 3.0" with its deed link; "Public domain" with an empty link if none).

## What to write

`out/m_NN.json` (NN is your batch number, two digits): a JSON array with one object per entry, in the batch's order, every entry included:

```
{"id": "AG-028",
 "images": [
   {"source": "Wikimedia Commons", "source_page": "https://commons.wikimedia.org/wiki/File:...", "title": "File:...",
    "site_url": "<the tool's site_url>", "width": 2816, "height": 2112, "kind": "photo",
    "date": "17 September 2006", "caption": "...", "alt": "...", "author": "...", "licence": "Public domain", "licence_url": "",
    "look_at": "<the path of the copy you looked at>", "relevance": "one line for the editors: which named thing it shows"}
 ],
 "searched": ["Lemoiz nuclear power plant", "central nuclear Lemoiz"],
 "note": "for an entry with no picture: one line on why (e.g. nothing on Commons shows the cable station)"}
```

`kind` is one of `photo`, `satellite`, `aerial`, `document`, `period map`. Copy `source_page`, `site_url`, `width`, `height`, `author`, `licence` and `licence_url` from the tool's output, not from memory. For NASA records the width and height may be null.

Then run `python3 check_media.py batches/m_NN.json out/m_NN.json` and fix every problem until it reports `PROBLEMS: 0`.

Your final reply: the batch number, the checker's last line, how many entries got two, one and no pictures, and the three choices you were least sure of, one line each. Do not paste the data.
