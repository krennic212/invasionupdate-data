# X scan runbook (official agency posts -> feed)

X is read only through the X MCP tools (`x` namespace). Scripts in this repo never call X; they turn
saved responses into rows. Hard cap: **999 X calls per CT day**, counted in
`/workspace/invasionupdate-xscan/usage-YYYY-MM-DD.json` (every call counts, including 429s and empty pages).

## Trusted reporter: Krennic decision 2026-10-09

`@BillMelugin_` (Fox News reporter, not an agency account) is a **trusted reporter**: his X posts may put rows
live like an official agency post (`TRUSTED_REPORTER_X_HANDLES` / `LIVE_X_HANDLES` in `scripts/x-handles.mjs`,
`isLiveSourceRow` in `scripts/rules.mjs`, and his handle is in the scan queries from `scripts/x-queries.mjs`).
Every other guard still applies to his rows: verbatim wording, the stage is never overstated, minors / people at large /
people not stated to be non-citizens are held pending, and victim names are stripped. If an official source also
exists, the official URL is used as `sourceUrl`. Photos stay official-only: his posts never supply a photo
(no photo candidates, `x-photo.mjs` refuses them). All other reporter / news / activist handles
(`NOT_OFFICIAL_X_HANDLES`) still go to review.json only.

## Every scheduled run (hourly, 7:39 AM - 5:39 PM CT)

0. `cd /workspace/invasionupdate-data && git pull --rebase`
1. Read the state: `cat data/x-scan-state.json` -> `lastSeenId` (highest post id already read).
2. Queries: `node scripts/x-queries.mjs` (currently 5 batched queries over the 211 official handles).
3. For each query (and each further page while `meta.next_token` is present):
   - Reserve first: `node scripts/x-usage.mjs reserve 1 "batch N page M"`. **Exit code 1 = stop the run now**
     (cap would pass 999). Do not make the call.
   - Window (Krennic 2026-10-09): `node scripts/x-queries.mjs --window` prints `{since_id}` or `{start_time}`.
     Every scan covers at least the last 75 minutes: it starts from whichever is EARLIER, the post after lastSeenId
     or now - 75 min (so the first run of the day still catches overnight posts). Dedupe handles any overlap.
   - Call `search_recent_posts`/`search_posts_all` with: `query`, the window from above (`since_id` or `start_time`), `max_results` 25+,
     `sort_order` recency, `post.fields` "created_at,author_id,attachments,note_tweet",
     `expansions` "author_id,attachments.media_keys", `user.fields` "username", `media.fields` "type,url".
     (`note_tweet` carries the full text of long posts; without it text is cut at 280 chars.)
   - Save the response verbatim to `/workspace/invasionupdate-xscan/run-<date>-<time>/pN.json`
     (raw API JSON is accepted as-is, or a plain array of {id, username, created_at, text, media}).
   - A 429 still counts; wait for the reset and retry with a fresh reservation.
   - If a needed post is still truncated, refetch with `get_posts_by_ids` (one reserved call, many ids).
4. Dry run: `node scripts/x-scan.mjs <run>/p*.json [--picks <run>/picks.json]`
   - Read every live row: verbatim sentence, stage label (Arrested / Charged / Convicted / Removed / As posted),
     person really named in that sentence. Names the pattern misses go in picks.json
     `{ "<postId>": [{ "name": "...", "sentence": "<verbatim>", "hold": "<optional reason>" }] }`.
     Use `hold` when the sentence's non-citizen wording is about someone else (e.g. a co-defendant).
   - Leave out: people stated to be U.S. citizens, officials who are not defendants, unnamed people.
5. Write: same command plus `--write`. This prepends rows to data/harvest.json (official + clean) and
   data/review.json (held or non-official), updates data/harvest-meta.json (`lastAddedAt`, `lastAddedCount`,
   `lastAdded` when live rows were added) and writes data/x-scan-state.json (new `lastSeenId`).
   If nothing new was read, still update the state file only when lastSeenId changed.
6. Photos: save the `--write` output to `<run>/write.json`. `photoCandidates` lists EVERY live official-post row whose
   post has any photo, with ALL of the post's images (`images[]`: original-size URL, alt text, `namesPerson`) and
   `pick` = the image whose alt text names the person. Review every candidate; none may be left undecided.
   - Download every image of the candidate and LOOK at each one (start with `pick` when set).
   - One named adult, plain headshot / booking photo, no text card, no other people, no child:
     `node scripts/x-photo.mjs <rowId> "<images[i].url>" --reviewed "Viewed image: <what you saw>"`
   - Otherwise: `node scripts/x-photo.mjs <rowId> --none "<why>"` (graphic, arrest scene, several people,
     evidence photo only, no image of the person, ...).
   - `multiPerson` candidates (flag "multi-person: match by alt text or caption only"): an image may only be tied
     to a person by alt text / caption naming them. x-photo.mjs still refuses to publish a photo for a post that
     produced more than one row, so record `--none "multi-person post"` (one decision covers the post).
   - Never a reporter/news image, never a minor, never a held row (the script refuses these anyway).
   - Then `node scripts/write-meta.mjs` to refresh the photo count (keeps lastAdded; lastAdded only lists
     rows that are approved right now).
   - Gate: `node scripts/x-photo.mjs --todo <run>/write.json` must print `"undecided": 0` (exit 0) before committing.
7. Check: `npm test && node scripts/validate.mjs && node scripts/dedupe.mjs data/harvest.json data/review.json`
8. Commit only if something changed (`git status --short`), `git pull --rebase`, then
   `git -c credential.helper='!gh auth git-credential' push`.
9. `gh workflow run hourly-harvest.yml -R krennic212/invasionupdate-data`, `gh run watch <id>`, then curl
   `https://krennic212.github.io/invasionupdate-data/harvest.json` and `harvest-meta.json` (retry; Pages lags).
10. Report the run's X call count (`node scripts/x-usage.mjs status`).

Typical quiet 30-minute run: 5 calls (one per query, no second page) + 0-1 refetch = ~6 calls,
~288/day at 48 runs. Stop paging early once results reach lastSeenId.

## Denaturalized people: Krennic decision 2026-10-16

People whose U.S. citizenship has **actually been revoked** (denaturalized) stay on the site. They are treated like a
stated non-citizen: `denaturalizedStated()` in `scripts/guards.mjs` checks the sentence plus the whole post text
(headlines like "CITIZENSHIP REVOKED" count), so they are not held under "not stated to be a non-citizen".
`x-scan.mjs` tags these rows `kind: "denaturalized"` (the app shows them as Denaturalized).
Only completed revocation counts ("citizenship revoked", "was denaturalized", "revoked his citizenship",
"stripped of his citizenship"). "Faces denaturalization proceedings", "initiated proceedings to revoke",
"seeks to revoke", "could be denaturalized" do NOT count: that person is still a U.S. citizen and stays held.
The stage label still follows the sentence wording (Convicted / Charged / ...); never label beyond what is stated.

## Deported + illegally reentered: Krennic decision 2026-10-19

Wording that the person was **deported AND illegally reentered** counts as stating the person is a non-citizen.
`deportedReentryStated()` in `scripts/guards.mjs` checks the sentence plus the whole post text, so such rows are not
held under "not stated to be a non-citizen". Both parts are required:
- deportation: "deported" / "deportation";
- illegal reentry: "illegally reentered / re-entered / reentering", "reentered / re-entered (the U.S. / the country)
  illegally", or "illegal reentry / re-entry" (e.g. "illegal reentry after deportation").
Bare "deported" (or "removed") alone does NOT count, and reentry wording without a deportation does not either.
The stage label still follows the sentence wording; never label beyond what is stated. First applied to
Denroy Dwayne Briscoe (@ICEgov 2111635929228017973), moved live with an approvalNote.

## Recent highlights always list child crimes: Krennic decision 2026-10-19

`data/highlights.json` (built by `scripts/severity.mjs`, `buildHighlights`) holds approved rows from the last 7 days
with severity > 0, sorted worst-first (severity desc, then newest, then name). The top 25 make the list, and **every
child-crime row in the window is always included too, even past the cap**: any row whose `severityCrimes` include a
category listed in `severity-points.json` `highlights.alwaysInclude` (today `childSex` = Child sex crime, which covers
child pornography / CSAM / enticement, and `childViolence` = Violent crime against a child / child abuse).
They keep their place in the score order; they are not forced to the top. All other rows still follow the top-25 rule.

## Krennic-approved rows are final: Krennic decision 2026-10-16

A row with an `approvalNote` that records a Krennic decision (e.g. "Krennic approved Oct 16, 2026 ...") is final.
The scan and any guard re-check must never re-flag it, move it back to review.json, change its status, or relabel
its crime/stage/kind. Leave it exactly as it is; raise any concern in the run report only.
