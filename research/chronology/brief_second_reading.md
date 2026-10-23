# Brief: second reader for the record chronologies

The register describes disruptions of civilian services in which several institutions each recorded one part of what happened. A first pass extracted, for each entry, a short chronology: the dated moments at which the event happened, each holder recorded or reported its part, someone made a finding or attribution, and someone joined the records. The site will publish these rows under each entry, as a strip on a time axis and as a table. You are the independent second reader. You did not write the rows; check them against the entry and correct them.

Working folder: `/tmp/claude-0/-home-claude/f827d55f-71c0-5ac4-9168-2237972221a3/scratchpad/chrono/`

The rules the first pass followed are in `CHRONO_BRIEF.md` in that folder. Read it first; the field definitions and the list of kinds are there.

## The one rule

**The entry's own text is the only source.** Every row must rest on words in the entry (`title`, `dates`, `summary`, `records`, `gap`, `joining`, `harm_found_later`). Do not search the web and do not use what you know about the event. If a row says more than the entry, cut it back or delete it.

## What to check, row by row

1. **Date.** The `date` (and `date_end`) follows from the entry's words: the year, month and day are those the entry gives, no more precise than the entry. A relative phrase ("nine days later", "the next day", "the same day") is allowed only when the entry dates the anchor; check the arithmetic. `approx` is true when the entry hedges (about, late, early, by, on or about, a season, a decade, a relative phrase counted from a hedged date).
2. **date_text** is copied word for word from the entry and is the phrase that gives this row's date.
3. **Holder.** The body the entry names as acting, in the entry's own name or a plain short form. `"event"` only for the disruption itself.
4. **Kind** fits the definitions in `CHRONO_BRIEF.md`. In particular: `joined` only where someone put separate records together, as the entry's `joining` field describes; a report that merely made one holder's part public is `reported`; an official inquiry result or verdict is `finding`; naming an attacker or hostile cause is `attributed`.
5. **Note.** At most 14 words, present tense, plain, says what the entry says the holder did on that date and nothing more: no motive, no judgment, no consequence the entry does not state, no figure the entry does not give. Use the entry's names and numbers exactly. Avoid stock phrasing ("plays a key role", "marks a turning point", "highlights"). Vary nothing for its own sake.
6. **Order.** Rows by date. A date known only to the year or month sorts as text before full dates in the same period; leave that as it is.

Then, for the entry as a whole:

7. **Missing moments.** If the entry dates a moment that shows who knew what and when (a holder's report, a finding, an attribution, the joining) and no row carries it, add it. Do not add rows for background dates that say nothing about the record. Keep the chronology lean: usually 3 to 10 rows.
8. **Duplicates.** Two rows that carry the same act on the same date become one.

## What to write

For your batch N:

- `out/c_N.reviewed.json`: the corrected chronology, same format as `out/c_N.json`, every entry in the batch's order, including entries you did not change.
- `review/r_N.md`: a log, one line per change: `AG-xxx row k: what you changed, and the entry's words that require it`. Then one line: `Unchanged entries: n`.

Build the corrected file with a short Python script that loads `out/c_N.json`, applies your changes and writes the result, so the changes are explicit. Then run

`python3 check_chrono.py batches/c_N.json out/c_N.reviewed.json`

and fix every problem until it reports `PROBLEMS: 0`.

Your final reply: the batch number, the checker's last line, the number of rows changed, deleted and added, and the three changes you think matter most, one line each. Do not paste the data.
