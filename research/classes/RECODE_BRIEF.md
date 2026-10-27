# Brief: recoding suspected attacks and attack claims

The Aggregation Gap register classifies each disruption of a civilian service by what happened to its divided record. Two of the old classes each held two different outcomes, and the register is being split so that each class means one thing:

- old **control** ("a suspected attack that institutions joined and settled as non-hostile, or left open")
- old **misattribution** ("records joined into an attack claim that later failed or remains disputed")

become three new classes:

- **false-alarm**: someone treated the disruption as a possible attack, and the record then settled it as not an attack (an accident, a technical failure, a natural cause, ordinary crime with no hostile aim against the service where the entry says so).
- **wrongly-blamed**: the records were joined into an attack claim (a named attacker or a hostile cause), and that claim later failed: an inquiry, a court, the claimant itself, or the evidence the entry describes rejected or contradicted it.
- **still-open**: the question was never settled. Either the cause was left open (no finding either way), or an attack claim was made and the entry describes it as still disputed, with no finding that it failed.

You code each entry in `entries.json` (all are old control or misattribution entries) into exactly one of the three.

## The one rule

**Use only the entry's own text** (`summary`, `records`, `gap`, `joining`, `harm_found_later`). No web, no outside knowledge, even where you know how the story ended. If the entry says a claim "remains disputed", it is still-open, whatever you believe.

## How to decide

1. Did the record settle the cause as not an attack? Look for an investigation, finding, report or verdict the entry describes that concluded accident, failure, natural cause and the like. If yes: **false-alarm**, unless an attack claim had been made and adopted first (then step 2).
2. Was an attack claim made (a state, agency, operator or court named an attacker or a hostile cause) and did the entry describe it as rejected, contradicted, withdrawn or unsupported by a later finding? If yes: **wrongly-blamed**.
3. Otherwise, if the entry says the cause or the claim remains open, unresolved, disputed or undetermined: **still-open**.

Where an entry fits two, choose the one its `joining` field supports. Where it is truly balanced, choose still-open and say why.

## What to write

`out_<your letter>.json`: a JSON array, one object per entry, in the order of `entries.json`:

```
{"id": "AG-055", "old": "control", "new": "false-alarm", "words": "<the entry's words, copied exactly, that decide it (one or two short passages)>", "field": "joining"}
```

Then run `python3 check_recode.py out_<your letter>.json` until it reports `PROBLEMS: 0`. It checks that every entry is present, that `new` is one of the three, and that `words` appears in the entry.

Your final reply: the counts for each new class, and the entries you found hardest, one line each. Do not paste the data.
