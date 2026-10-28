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

## Every scheduled run (3 times a day, every day: 9 AM, 12 PM, 5 PM CT)

Schedule (Krennic, Oct 22, 2026): cron `0 9,12,17 * * *` America/Chicago, flexible by up to 15 min.
Each run reads everything since the saved `lastSeenId`; the 9 AM run covers overnight.
The daily photo job stays at 1:03 PM CT.


0. `cd /workspace/invasionupdate-data && git pull --rebase`
1. Read the state: `cat data/x-scan-state.json` -> `lastSeenId` (highest post id already read).
2. Queries: `node scripts/x-queries.mjs` (currently 5 batched queries over the 211 official handles).
3. For each query (and each further page while `meta.next_token` is present):
   - Reserve first: `node scripts/x-usage.mjs reserve 1 "batch N page M"`. **Exit code 1 = stop the run now**
     (cap would pass 999). Do not make the call.
   - Window: `node scripts/x-queries.mjs --window` prints `{since_id}`. Each run reads everything since the saved
     lastSeenId (no fixed lookback); the 9 AM run covers overnight. Dedupe handles any overlap.
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
   `--write` also (Krennic 2026-10-27, no extra steps needed): fills map points for every row with a stated place and
   no point (`scripts/geo.mjs`: city-geo.json, then the free Nominatim geocoder at 1 request/second, hits cached in
   city-geo.json; `GEOCODE=0` = offline), takes anyone who is now live out of review.json (name + aka keys), and
   re-stamps harvest-meta.json, and sets `tags` on every row (`scripts/tags.mjs`, rules below). Suspicious names (trailing month word, "Place.Name", single word, all-caps headline
   text) are held by the guards, never published.
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
7. Check: `node scripts/dedupe.mjs data/harvest.json data/review.json && npm test && node scripts/validate.mjs`
   (`npm test` re-stamps harvest-meta.json first via `pretest`, so a hand edit can no longer leave it stale.)
8. Commit only if something changed (`git status --short`), `git pull --rebase`, then
   `git -c credential.helper='!gh auth git-credential' push`.
9. `gh workflow run hourly-harvest.yml -R krennic212/invasionupdate-data`, `gh run watch <id>`, then curl
   `https://krennic212.github.io/invasionupdate-data/harvest.json` and `harvest-meta.json` (retry; Pages lags).
10. Report the run's X call count (`node scripts/x-usage.mjs status`).

Typical quiet run: 5 calls (one per query, no second page) + 0-1 refetch = ~6 calls,
~18/day at 3 runs (the 9 AM run may page more). Stop paging early once results reach lastSeenId.

## Tags: CHNV / DACA / Entered under Biden / Entered under Obama: Krennic decision 2026-10-28

Every row in harvest.json and review.json has `tags` (array, often `[]`), set by `scripts/tags.mjs` (`tagsFor`) from the
row's own words only (`crime`, `usa`, `entered`, and the person's own part of `text`). It never reads `foreign`,
`approvalNote` or `reviewReason`, and it never guesses. Values, in this order: `CHNV`, `DACA`, `Entered under Biden`, `Entered under Obama`.
- **CHNV**: "CHNV", or the Cuba, Haiti, Nicaragua (and) Venezuela parole program (incl. "Biden's CHNV flights").
  CHNV always also gets **Entered under Biden** (the program only ran under Biden, 2022-2025).
- **DACA**: DACA / Deferred Action for Childhood Arrivals stated as the person's status, current or former ("DACA
  recipient", "granted DACA in 2015", "DACA 2013", "former DACA"). A denial, an application, policy news, or another
  kind of "deferred action" is not DACA.
- **Entered under Biden / Obama**: entry, crossing, arrival, release or parole wording tied to "Biden" / "Obama" in the
  same sentence ("released ... by the Biden administration", "Obama-released"), OR a date of the entry itself that
  falls entirely inside Jan 20, 2021 - Jan 19, 2025 (Biden) or Jan 20, 2009 - Jan 19, 2017 (Obama), inclusive.
  "Entered in 2023", "re-entered 2023", "Aug 2022", "12/21/2023", "a 2015 entry" count. A bare year or a January that
  straddles an inauguration (2009, 2017, 2021, 2025) does not. Dates of removals, orders, convictions, pleas, votes or
  LPR status ("lawful permanent resident since 2022") are not entry dates; "since 2007" is not an entry date.
  "Illegal reentry, March 2015" / "convicted of illegal entry in 2015" are charges, not entry dates.
  "Not stated" / "unknown date" = no entry tag. The administration's name must belong to the entry verb ("ignored by
  the Obama administration", "deported under Obama" do not count).
- Multi-person post (rows that share a sourceUrl or the same text): only the sentences from this person's name to
  the next person's name count, so a co-defendant's wording never tags them.
- Tags are additive metadata: they are also set on approvalNote / Krennic-final rows; nothing else on a row changes.

Pipelines: `x-scan.mjs --write`, `harvest.mjs` (press releases, pending.json, DOJ / state sources), `approve.mjs`, the
workflow step "Tags" and `npm run harvest` all (re)tag. After a hand edit: `node scripts/tags.mjs` (`--check` = report only).
`validate.mjs` and `scripts/tags.test.mjs` fail if any row's tags differ from `tagsFor()`.
Site: Grok Build prompt in `docs/grok-build-tags-prompt.md` (badges + filter chips from the feed's `tags`).

## Denaturalized people: Krennic decision 2026-10-16

People whose U.S. citizenship has **actually been revoked** (denaturalized) stay on the site. They are treated like a
stated non-citizen: `denaturalizedStated()` in `scripts/guards.mjs` checks the sentence plus the whole post text
(headlines like "CITIZENSHIP REVOKED" count), so they are not held under "not stated to be a non-citizen".
`x-scan.mjs` tags these rows `kind: "denaturalized"` (the app shows them as Denaturalized).
Only completed revocation counts ("citizenship revoked", "was denaturalized", "revoked his citizenship",
"stripped of his citizenship"). "Faces denaturalization proceedings", "initiated proceedings to revoke",
"seeks to revoke", "could be denaturalized" do NOT count: that person is still a U.S. citizen and stays held.
The stage label still follows the sentence wording (Convicted / Charged / ...); never label beyond what is stated.

## "Deported" means illegal alien: Krennic decision 2026-10-19 (11:42 AM CT)

This replaces the narrower morning rule (deported AND illegally reentered). When a post says the named person was
**deported**, that counts as non-citizen wording on its own; no illegal-reentry wording is needed.
`deportedStated()` in `scripts/guards.mjs` checks the sentence plus the whole post text, so such rows are not held
under "not stated to be a non-citizen".
- Counts: "deported", "deported to <country>", "DEPORTED:" headlines, "deportation of him / her / <Name>",
  "(illegal reentry) after (a prior) deportation", "removed (him / her) to <Country>" (e.g. "removed to Mexico by ICE").
- Does NOT count: forward-looking wording ("will / could / may / to be deported", "faces / facing / pending /
  awaiting deportation", "deportation proceedings").
- The U.S.-citizen override still wins: if the post says the person is a U.S. / United States / American citizen,
  a dual national or naturalized, "deported" does not count (falsely claiming to be a U.S. citizen does not trigger
  the override). Denaturalization rules (below) are unchanged.
- The stage label still follows the post's own wording (Removed / Convicted / Charged / Arrested); an earlier crime
  that was only an arrest stays an arrest. Never label beyond what is stated.
- Krennic holds still win: a review row whose approvalNote records "Krennic kept held" stays held even if the guard
  now passes it (Sergio Lopez-Leos, Aurelio Perez-Abrego, 2026-10-19). Never move those rows.
Applied to Denroy Dwayne Briscoe (@ICEgov 2111635929228017973) and Juan Carlos Plascencia-Torres
(@ICEgov 2112212456797880328, live as Removed), each moved live with an approvalNote.

## "Undocumented immigrant" is non-citizen wording: Krennic decision 2026-10-19

"Undocumented immigrant(s)" (also "undocumented migrant / alien / noncitizen" and "an undocumented ...", e.g.
"an undocumented Mexican man") counts as stating the person is a non-citizen, the same as "illegal alien".
`nonCitizenStated()` in `scripts/guards.mjs` accepts it. Like "illegal alien", it is checked on the sentence that
names the person; a "U.S. citizen" statement still wins. Charge text stays verbatim: never rewrite the post's words
to add or swap in this wording. First applied to Angel-Antonio Penaloza-Rojo (@USAO_NDIN 2112180783431463009),
moved live as Convicted with an approvalNote (his post says "The defendant, an undocumented immigrant, ..." in a
separate sentence, so the approval rests on the note, not on the guard).

## Recent highlights always list child crimes: Krennic decision 2026-10-19

`data/highlights.json` (built by `scripts/severity.mjs`, `buildHighlights`) holds approved rows from the last 7 days
with severity > 0, sorted worst-first (severity desc, then newest, then name). The top 25 make the list, and **every
child-crime row in the window is always included too, even past the cap**: any row whose `severityCrimes` include a
category listed in `severity-points.json` `highlights.alwaysInclude` (today `childSex` = Child sex crime, which covers
child pornography / CSAM / enticement, and `childViolence` = Violent crime against a child / child abuse).
They keep their place in the score order; they are not forced to the top. All other rows still follow the top-25 rule.

## Krennic-approved rows are final: Krennic decision 2026-10-16

A row with an `approvalNote` that records a Krennic decision (e.g. "Krennic approved Oct 16, 2026 ...", or
"Krennic kept held 2026-10-19" on a held review row) is final.
The scan and any guard re-check must never re-flag it, move it back to review.json, change its status, or relabel
its crime/stage/kind. Leave it exactly as it is; raise any concern in the run report only.
