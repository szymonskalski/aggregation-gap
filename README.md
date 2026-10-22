# Aggregation Gap Atlas: website

A public website that maps the events of the Aggregation Gap Casebook, rebuilt every day from a Google Sheet.

**How it fits together.** Editors work in the Google Sheet. Its Events tab is published to the web as CSV. Every morning a GitHub Actions job downloads that CSV, checks every row, builds the site and deploys it to GitHub Pages. The build also writes `feed.xml`, a feed of the newest entries, which a newsletter service turns into an email digest for subscribers.

If a build fails (the sheet cannot be reached, or no row is valid), nothing is deployed and the site stays as it was. GitHub emails the repository owner, and the build log lists the reasons.

## One-time setup

### 1. The Google Sheet
1. Upload `sheet/Aggregation_Gap_Casebook_master.xlsx` to Google Drive, open it with Google Sheets, and choose **File → Save as Google Sheets**.
2. Share it with edit access for the editors only.
3. **File → Share → Publish to web.** Under *Link*, choose the **Events** tab (not *Entire document*) and **Comma-separated values (.csv)**, then **Publish**. Copy the link.
4. Under *Published content and settings*, keep **Automatically republish when changes are made** ticked.

Everything in the Events tab is public, drafts included. Private remarks belong in the *Editor notes* tab, and suggestions from the public stay in the form's own responses tab. Never publish those tabs.

### 2. GitHub
1. Create a repository (for example `aggregation-gap`) and push this folder to its `main` branch.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Settings → Secrets and variables → Actions → Variables**, add:
   - `SHEET_CSV_URL`: the link from step 1.3
   - `BASE_URL`: the site's address, e.g. `https://<account>.github.io/aggregation-gap/` (or the custom domain)
4. **Actions → Build and deploy → Run workflow.** The site appears at the Pages address within a few minutes.

### 3. Suggestions from the public
Create a Google Form with these questions: your name; email; affiliation; the event (short name); dates; place; what happened; which institutions recorded it; sources (citations or links). In **Responses**, link the form to the master spreadsheet: Google adds a responses tab, which is never published. Put the form's public link in `site.config.json` under `suggest_url`.

### 4. Email updates
Open an account with a newsletter service that sends RSS-to-email digests (check that the plan you choose includes this feature). Point its RSS automation at `<site address>/feed.xml` and choose a weekly or monthly digest. Then fill in `site.config.json`:
- `subscribe.form_action`: the URL the provider's embedded signup form posts to, and `subscribe.email_field` if its email field is not called `email`; or
- `subscribe.page_url`: the provider's hosted signup page, if you prefer a button.
- `subscribe.provider_name`: the service's name, shown under the form.

Until this is set, the site offers the RSS feed alone.

### 5. Optional: a custom domain
Add the domain under **Settings → Pages → Custom domain** and set `BASE_URL` to it.

## Day to day
- Edit the sheet. Changes go live the next morning, or at once with **Actions → Build and deploy → Run workflow**.
- **New entry:** give it the next free AG number, fill the columns (hover over a header for its meaning), set `status` to `published` and `added` to today's date.
- **Remove an entry:** set `status` to `withdrawn`. Do not delete rows or reuse numbers.
- The build skips rows with an invalid id, year or case type and names them in the log; the rest of the site still deploys.
- GitHub pauses scheduled runs in a public repository after 60 days without commits. If daily updates stop, open the Actions tab and re-enable the workflow.

## Local preview
```
node build/build.mjs               # builds _site/ from data/events.seed.csv, or from SHEET_CSV_URL if set
python3 -m http.server -d _site 8000
```

## Files
- `build/build.mjs`: the site generator (no dependencies beyond Node 20)
- `assets/`: styles, the map script, fonts (EB Garamond), d3 and topojson, the base map (Natural Earth via world-atlas)
- `data/events.seed.csv`: the casebook as of October 2026, used before the sheet is connected
- `sheet/`: the master spreadsheet and the script that made it
- `site.config.json`: title, address, subscription and suggestion settings
