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

To withdraw an entry, set `status` to `withdrawn`. Rows are never deleted and numbers never reused.

The build skips a row with an invalid id, year or case type and names it in the log. The rest of the site still goes out.

GitHub pauses scheduled runs in a public repository after 60 days without a commit. If the daily update stops, re-enable the workflow in the Actions tab.

## Building it locally

```
node build/build.mjs               # builds _site/ from the sheet, or from data/events.seed.csv if no sheet is set
python3 -m http.server -d _site 8000
```

## What is where

- `build/build.mjs`: the site generator, which needs nothing beyond Node 22
- `assets/js/plate.js`: the map, the scale of years, the register and the record
- `assets/css/site.css`, `assets/fonts/`: styles and type (Libre Caslon Text and Libre Franklin, SIL Open Font License)
- `assets/vendor/`: d3 and topojson
- `assets/data/land-50m.json`, `land-110m.json`: coastlines from Natural Earth (public domain), via world-atlas
- `assets/data/borders-cshapes.json`: boundaries and country names for each period, derived from CShapes 2.0 (Schvitz et al. 2022) and licensed, like its source, CC BY-NC-SA 4.0, for non-commercial use only
- `assets/img/locator.svg`: the small world map on each entry page
- `data/events.seed.csv`: a copy of the register, used when no sheet is set
- `sheet/`: the master spreadsheet and the script that made it
- `site.config.json`: title, address, and the subscription and suggestion settings
