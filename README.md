# invasionupdate-data

Public data feed for **Invasion Update** (https://invasionupdate.grok.me).
This repo holds only the harvest scripts, the workflow, and the data files. It has no app code and no secrets. The only photos are copies of images from official single-person releases (`data/photos/`).

## Files

- `data/harvest.json`: the feed. A JSON array of case rows taken from **official federal sources only**
  (dhs.gov, ice.gov, cbp.gov, justice.gov and other federal agency sites). Every row has `sourceUrl`, `when` (date), `photo: ""`, and
  `status`, which is `"approved"` or `"pending"`.
- `data/harvest-meta.json`: `{ updatedAt, rows, approved, pending, photos, reviewRows, lastAddedAt, lastAddedCount, lastAdded, source }`. `updatedAt` is the last time the feed changed (new rows, an approval, or a photo). `lastAddedAt` / `lastAddedCount` / `lastAdded` are the time and names of the last run that actually added people; runs that add nobody keep the previous values.
- `data/harvest-status.json`: notes from the last run that changed something.
- `data/review.json`: rows from X posts, reporters, and news sites. These rows are **never** published by this feed and are kept here for review only.
- `data/pending.json`: optional intake. Rows dropped here are sorted on the next run. Official sources go to the feed, and anything else goes to `review.json`.

Served at **https://krennic212.github.io/invasionupdate-data/harvest.json** (plus `harvest-meta.json` and `harvest-status.json`). `review.json` is not deployed.

## Rules the scripts enforce

- Only official federal or agency sources go live.
- A person is added only when the release itself names them **and** describes them with its own non-citizen wording
  ("illegal alien", "national", "citizen of", "unlawfully present"). Immigration status is never inferred.
- The charge label is the release's sentence, copied word for word (DOJ/DHS wording included). The `Charged` / `Convicted` / `Removed`
  prefix comes from the verbs in that sentence or the release title.
- Duplicates are removed when they are the same person on the same release. Co-defendants are never merged.
- **Photos (official releases only).** A row gets a photo only when:
  - it is approved and passes every guard;
  - its official release page produced exactly one row and names exactly one person, and the title doesn't describe several defendants;
  - the release body has one image whose alt text, title, caption or file name names that person (or says booking/mugshot). Seals, logos, banners, theme art and generic or og:image defaults are skipped.

  The image is copied to `data/photos/<id>.jpg` (300 KB or less) and served from this Pages site. `photo` holds the Pages URL and `photoSourceUrl` holds the original. Rows from X or news never get photos.
  Each release is checked once, and the result is stored in `data/photo-checks.json`. `scripts/validate.mjs` fails the run if any photo breaks these rules or its file is missing.
- The feed never shrinks. `scripts/validate.mjs` fails the run if any existing row would disappear.

## Approval gate and hard guards

`AUTO_APPROVE: "true"` is set in `.github/workflows/hourly-harvest.yml`, so new official rows go live right away (`"status": "approved"`).
The site shows only rows marked `"approved"`.

These hard guards (`scripts/guards.mjs`) apply **even with auto-approve on**. A row that trips one is written as `"pending"`, with a `holdReason`, and stays off the site until a person approves it:

- The release indicates the person is a **minor or juvenile**.
- **Stage escalation.** The label would be later than the source's own wording, so a charged, indicted or arrested person is never labeled Convicted or Sentenced. "Prior conviction" and "previously removed" never set the stage.
- The person is a **suspect still at large**.
- The source sentence **doesn't state the person is a non-citizen** (dual citizens included).

To approve, open **Actions → Hourly harvest → Run workflow**.
- `all` approves every pending row that has no `holdReason`.
- A held row is approved only when you name its `id`, which also clears its `holdReason`.

Locally: `node scripts/approve.mjs all` or `node scripts/approve.mjs <id>,<id>`.
To require approval for every new row, set `AUTO_APPROVE: "false"`.

## Schedule

The workflow runs hourly at :47 (`47 * * * *`) and can also be started by hand. It commits (`[skip ci]`) and redeploys Pages **only when rows change**.

Spotted a mistake? Open an issue: https://github.com/krennic212/invasionupdate-data/issues
