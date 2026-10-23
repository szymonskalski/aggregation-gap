# Brief: second reader for the pictures

A first reader chose up to two pictures for each entry of the Aggregation Gap register and wrote captions and credits. The rules they followed are in `MEDIA_BRIEF.md` in this folder; read it first. You are the independent second reader. You did not choose these pictures. Your task is to confirm or correct each one, and to remove any that break the rules. You do not add pictures.

Working folder: `/tmp/claude-0/-home-claude/f827d55f-71c0-5ac4-9168-2237972221a3/scratchpad/media/`
Tool: `python3 /home/claude/aggregation-gap/tools/media_lookup.py`


**Requests.** Reach Wikimedia and NASA only through the tool, or with curl using the tool's User-Agent (`AggregationGapAtlas/1.0 (https://github.com/szymonskalski/aggregation-gap)`). Never put an email address, a name or any other personal detail into a request, a header or a query.


**Period maps.** A map made at the time by a government shows the place as a photograph would when it shows the physical site or works the entry describes (a dam, drainage canals, a pipeline route); it qualifies on that ground. A map that presents an assessment, an attribution or a casualty count is a document of that assessment, and qualifies only if the entry itself names the assessment.


**UN bodies.** A picture that a UN-system body has itself released under CC BY or CC BY-SA on its own channel (for example the IAEA Imagebank on Flickr) is acceptable, above all where the entry names that body as a holder of the record. UN Photo and news-agency pictures remain excluded.

## For each chosen picture

1. Run `file "File:..." look` (or `nasafile NASA_ID look`) yourself, fresh. Compare with what the first reader recorded: `source_page`, `site_url`, `width`, `height`, `author`, `licence`, `licence_url`. Correct any difference. Remove the picture if the licence is not acceptable, if the page now shows a deletion request or a personality-rights notice, or if the author or source is a news or UN agency.
2. Open the copy in `look/` with the Read tool and look at it. Remove the picture if it shows dead, injured or distressed people, or a private individual who can be recognized.
3. **Relevance.** Keep the picture only if it shows what `MEDIA_BRIEF.md` allows: the named facility, site or object; the event or its physical aftermath; a satellite or aerial view of the event or named site; or a document or period map of the record. Ask whether a reader of the entry would see at once what the picture has to do with it. A general view, a similar object elsewhere, or a modern map is removed.
4. **Caption.** Every fact in the caption (what, where, when) must be found in the file's title, description, date or categories, or in the entry's text. Check the picture's date against the file record: a 2006 photograph of a plant must not read as if taken at the time of the event. Cut anything else. One sentence, at most 30 words, plain American English, no judgment.
5. **Alt text.** Describes what is visible, at most 25 words.
6. **Credit.** `author` as the source gives it; `licence` and `licence_url` as the tool gives them.
7. **Size.** A picture whose original is narrower than 500 pixels is too small for the site and is removed.

## What to write

- `out/m_NN.reviewed.json`: the corrected batch, same format as `out/m_NN.json`, every entry in the batch's order, including those you did not change. A removed picture is simply left out; if an entry is left with none, give it a `note` saying why.
- `review/rm_NN.md`: one line per change: `AG-xxx picture k: kept / caption corrected / removed, and the reason (with the words of the file record or entry that require it)`. Then one line: `Pictures confirmed unchanged: n`.

Build the corrected file with a short Python script that loads `out/m_NN.json` and applies your changes. Then run `python3 check_media.py batches/m_NN.json out/m_NN.reviewed.json` until it reports `PROBLEMS: 0`.

Your final reply: the batch number, the checker's last line, how many pictures you confirmed, corrected and removed, and the three most important changes, one line each. Do not paste the data.
