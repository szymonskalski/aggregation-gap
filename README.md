# The Aggregation Gap: website

This repository builds the public site of the Aggregation Gap register, a world map and catalogue of disruptions of civilian services since 1945. The editors keep the register in a Google Sheet. Every morning a GitHub Actions job downloads the sheet's Events tab as CSV, checks each row, builds the pages and publishes them on GitHub Pages. The same job writes `feed.xml`, which a newsletter service can turn into notices by email.

A build that cannot reach the sheet, or finds no valid row, publishes nothing, and the site stays as it was. GitHub then emails the owner of the repository, and the build log names the rows at fault.

## Setting it up

The Google Sheet

1. Upload `sheet/Aggregation_Gap_Casebook_master.xlsx` to Google Drive, open it in Google Sheets and save it as a Google Sheet.
2. Share it with edit access for the editors only.
3. Under File, Share, Publish to web, choose the Events tab and "Comma-separated values (.csv)", publish, and copy the link. Leave "Automatically republish when changes are made" ticked.

Everything in the Events tab becomes public, drafts included. Private remarks go in the Editor notes tab, and suggestions from the public stay in the form's own responses tab. Neither is ever published.

GitHub

1. Under Settings, Pages, set the source to GitHub Actions.
2. Under Settings, Secrets and variables, Actions, Variables, add `SHEET_CSV_URL` (the link from the sheet) and `BASE_URL` (the site's address, for example `https://<account>.github.io/aggregation-gap/`).
3. Under Actions, Build and deploy, choose Run workflow. The site appears within a few minutes.

Suggestions from the public. Make a Google Form asking for name, email, affiliation, the event, its dates and place, what happened, which institutions recorded it, and sources. Link its responses to the master spreadsheet, which adds a responses tab that is never published, and put the form's public link in `site.config.json` under `suggest_url`.

Notices by email. Open an account with a newsletter service that sends digests from an RSS feed, and point it at `<site address>/feed.xml`. Then fill in `subscribe` in `site.config.json`: either `form_action` (the address the provider's signup form posts to, with `email_field` if the field is not called `email`) or `page_url` (the provider's own signup page), and `provider_name`. Until then the site offers the RSS feed alone.

A custom domain can be added under Settings, Pages, with `BASE_URL` changed to match.

## Keeping the register

Changes to the sheet go live the next morning, or at once from Actions, Build and deploy, Run workflow.

A new entry takes the next free AG number. Fill the columns (each header carries a note on its meaning), set `status` to `published` and `added` to the day's date. In `records`, write one holder per line, as `Holder: what it held.` The `use_in_volume` column stays in the sheet and is not shown on the site.

The `Chronology` tab holds the dated moments of each entry's record, one row per moment: `id`, `seq`, `date` (`YYYY`, `YYYY-MM` or `YYYY-MM-DD`, no more precise than the entry), `date_end` for a span, `date_text` (the entry's own words for the date), `approx` (`yes` where the entry hedges), `holder`, `kind` (`event`, `recorded`, `reported`, `finding`, `attributed`, `denied`, `joined` or `other`), `note` (a few words on what happened) and `field` (the entry column the row rests on). Every row must rest on the entry's text. The tab is made by `sheet/add_chronology_and_media_tabs.gs`; until it exists, the site uses `data/chronology.seed.csv`. The `Media` tab holds the pictures, one row per picture (`id`, `seq`, `kind`, `site_url`, `source_page`, `source`, `title`, `caption`, `alt`, `author`, `licence`, `licence_url`, `date`, `width`, `height`, `status`); only rows whose `status` is `published` are shown, at most two per entry, and only from Wikimedia Commons or NASA under public-domain or Creative Commons BY and BY-SA terms. Until the tab exists, the site uses `data/media.seed.csv`.

To withdraw an entry, set `status` to `withdrawn`. Rows are never deleted and numbers never reused.

The build skips a row with an invalid id, year or case type and names it in the log. The rest of the site still goes out.

GitHub pauses scheduled runs in a public repository after 60 days without a commit. If the daily update stops, re-enable the workflow in the Actions tab.

## Exercises

The Exercises section turns entries into decision-forcing cases. Each exercise is a file in `data/exercises/`, named after its entry (`AG-060.json`), with a number, a neutral title (one that does not give the outcome away), a period, and a list of points of decision. Each point names the institution the player sits in (`as`), what it has before it (`before`), the question, two to five `options` (each with a `kind`: `recorded`, `reported`, `finding`, `attributed`, `denied`, `joined` or `waited`, and one marked `"actual": true`), what was done (`did`), and optionally the further words on it (`did_q`), what others held that the player could not know (`unknown`) and what followed (`then`). Wherever the player is shown a fact, it is either a row of the entry's chronology, given by its `seq` number, or words copied from the entry, given as `{"q": "..."}` (with `"who"` to name the holder). The build checks every such passage against the entry, and that the option marked as done has the same kind as the record of what was done; an exercise that fails is left out and named in the log. The options are possibilities; only the one marked as done is a claim about the record.

## Building it locally

```
node build/build.mjs               # builds _site/ from the sheet, or from data/events.seed.csv if no sheet is set
python3 -m http.server -d _site 8000
```

## What is where

- `build/build.mjs`: the site generator, which needs nothing beyond Node 22; `build/extras.mjs` draws the chronology and places the detail map under each entry
- `assets/js/plate.js`: the map, the scale of years, the register and the record; `assets/js/exercise.js`: the player of the exercises, built by `build/exercises.mjs` from `data/exercises/`
- `assets/css/site.css`, `assets/fonts/`: styles and type (Libre Caslon Text and Libre Franklin, SIL Open Font License)
- `assets/vendor/`: d3 and topojson
- `assets/data/land-50m.json`, `land-110m.json`: coastlines from Natural Earth (public domain), via world-atlas
- `assets/data/borders-cshapes.json`: boundaries and country names for each period, derived from CShapes 2.0 (Schvitz et al. 2022) and licensed, like its source, CC BY-NC-SA 4.0, for non-commercial use only
- `assets/img/locator.svg`: the small world map on each entry page
- `assets/maps/`: the detail map of each placed entry, as SVG, with `manifest.json` for the captions; boundaries from CShapes 2.0 (CC BY-NC-SA 4.0), everything else from Natural Earth 1:10m (public domain)
- `tools/`: the generator of the detail maps (`node tools/detail_maps.mjs data/events.seed.csv <natural-earth-geojson-dir> <CShapes-2.0.geojson> assets/maps [AG-001,AG-002]`, after `npm install` in `tools/`) and a script that lists openly licensed pictures for each entry; neither runs in the daily build
- `data/chronology.seed.csv`: a copy of the Chronology tab, used when the sheet has none
- `research/chronology/`, `research/pictures/`: the briefs the chronologies and pictures were made under, the checkers, and the second readers' logs of every change
- `research/media_candidates.json`: the first shortlist of openly licensed pictures for each entry (1,800 candidates for 303 entries, from Wikimedia Commons and NASA, with licence data), from which the pictures were chosen; most candidates are off-topic and none is shown on the site unless chosen
- `data/events.seed.csv`: a copy of the register, used when no sheet is set
- `sheet/`: the master spreadsheet and the script that made it
- `site.config.json`: title, address, and the subscription and suggestion settings
