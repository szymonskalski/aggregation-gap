# Brief: record chronologies for the Aggregation Gap register

The register describes disruptions of civilian services in which several institutions each recorded one part of what happened, and the records were joined late, partly or never. For each entry we now want a short chronology: the dated moments at which the event happened, each holder recorded or reported its part, someone made a finding or an attribution, and someone joined the records. The site will draw it as a strip, one row per holder on a time axis, so the reader sees the gap between the event and the joining.

Working folder: `/tmp/claude-0/-home-claude/f827d55f-71c0-5ac4-9168-2237972221a3/scratchpad/chrono/`

## The one rule

**Use only the entry's own text.** The entries have been checked against their sources twice. Every row must rest on words in the entry (`title`, `dates`, `summary`, `records`, `gap`, `joining`, `harm_found_later`). Add no date, holder, action or order that the entry does not state. Do not search the web. If the entry does not date something, leave it out: an undated record cannot be placed on a time axis.

## What to write

`out/c_N.json`: a JSON array with one object per entry, in the batch's order:

```
{"id": "AG-201", "rows": [
  {"date": "2021-05-07", "date_end": null, "date_text": "on or about 7 May 2021", "approx": true,
   "holder": "event", "kind": "event", "note": "Ransomware hits Colonial Pipeline", "field": "summary"},
  {"date": "2021-05-11", "date_end": null, "date_text": "11 May 2021", "approx": false,
   "holder": "Brandon Wales", "kind": "reported", "note": "Testifies that CISA got its information from the FBI", "field": "gap"},
  {"date": "2021-06-07", "date_end": null, "date_text": "7 June 2021", "approx": false,
   "holder": "Justice Department", "kind": "joined", "note": "Announces seizure of most of the ransom", "field": "records"}
]}
```

Fields of a row:
- `date`: `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, only as precise as the entry. "late 2009" is `2009`; "summer 2010" is `2010`; "1987/88" is `1987`; "in the 1990s" is `1990` with `approx: true`.
- `date_end`: the end of a stated span ("2009 to 2010", "from March to June 1999"), same format, else `null`.
- `date_text`: the words of the entry that give the date, copied exactly (they must appear word for word in the entry). A day and month without a year ("on 7 May") is fine when the year is stated in the entry's `dates` field or earlier in the same field; give the full date in `date`.
- `approx`: `true` when the entry hedges the date ("about", "late", "on or about", "by", a season, a decade).
- `holder`: who acted, as the entry names it (a short form of the same name is fine: "FBI", "the Interior Ministry"). For the disruption itself, `"event"`.
- `kind`, one of:
  - `event`: the disruption, attack or incident itself (every entry has at least one `event` row);
  - `recorded`: a holder logged, counted, observed or kept its own part of the record;
  - `reported`: a holder reported to another body or made its part public (a statement, testimony, press report, publication);
  - `finding`: an official finding, report, verdict, judgment or inquiry result;
  - `attributed`: someone named an attacker or a hostile cause;
  - `denied`: someone denied, disputed or withdrew a claim;
  - `joined`: someone put the separate records together (the entry's `joining` field says who and when);
  - `other`: a dated step that fits none of these (an arrest, a trial opening, a law passed), used sparingly.
- `note`: at most 14 words, plain, in the present tense, saying what happened, drawn from the entry. No judgment, no new facts.
- `field`: the entry field the row rests on.

Order the rows by `date`. Keep it lean: the dated moments that show who knew what and when, usually 3 to 10 rows. Do not split one sentence into several rows unless it dates several different acts. If the entry says the records were never joined, there is simply no `joined` row.

## Procedure

1. Read your batch `batches/c_N.json` in full.
2. Write `out/c_N.json`, preferably from a short Python script, as valid JSON.
3. Run `python3 check_chrono.py batches/c_N.json out/c_N.json` and fix every problem it lists. It checks that each `date_text` appears in the entry, that the year matches, that each holder is named in the entry, and that rows are in date order with at least one `event` row.
4. Repeat until it reports `PROBLEMS: 0`.

Your final reply: the batch number, the checker's last line, the number of entries and rows, and any entry with no datable record (event row only), one line each. Do not paste the data.
