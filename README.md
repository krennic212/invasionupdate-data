# invasionupdate-data

Public data feed for **Invasion Update** (https://invasionupdate.grok.me).
This repo holds only the harvest scripts, the workflow, and the data files. It has no app code, no secrets, and no photos.

## Files

- `data/harvest.json`: the feed. A JSON array of case rows taken from **official federal sources only**
  (dhs.gov, ice.gov, cbp.gov, justice.gov and other federal agency sites). Every row has `sourceUrl`, `when` (date), `photo: ""`, and
  `status`, which is `"approved"` or `"pending"`.
- `data/harvest-meta.json`: `{ updatedAt, rows, approved, pending, reviewRows, source }`. `updatedAt` is the last time the feed changed (new pending rows or an approval).
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
- `photo` is always blank.
- The feed never shrinks. `scripts/validate.mjs` fails the run if any existing row would disappear.

## Approval gate

New rows come in as `"status": "pending"`, and the site shows only `"approved"` rows.
To approve, open **Actions → Hourly harvest → Run workflow** and enter `all`, or a comma-separated list of row `id`s, in the *approve* box.
Locally: `node scripts/approve.mjs all`.
To let new official rows go live automatically, set `AUTO_APPROVE: "true"` in `.github/workflows/hourly-harvest.yml`.

## Schedule

The workflow runs hourly at :47 (`47 * * * *`) and can also be started by hand. It commits (`[skip ci]`) and redeploys Pages **only when rows change**.

Spotted a mistake? Open an issue: https://github.com/krennic212/invasionupdate-data/issues
