# X scan runbook (official agency posts -> feed)

X is read only through the X MCP tools (`x` namespace). Scripts in this repo never call X; they turn
saved responses into rows. Hard cap: **999 X calls per CT day**, counted in
`/workspace/invasionupdate-xscan/usage-YYYY-MM-DD.json` (every call counts, including 429s and empty pages).

## Every scheduled run (every 30 min)

0. `cd /workspace/invasionupdate-data && git pull --rebase`
1. Read the state: `cat data/x-scan-state.json` -> `lastSeenId` (highest post id already read).
2. Queries: `node scripts/x-queries.mjs` (currently 5 batched queries over the 211 official handles).
3. For each query (and each further page while `meta.next_token` is present):
   - Reserve first: `node scripts/x-usage.mjs reserve 1 "batch N page M"`. **Exit code 1 = stop the run now**
     (cap would pass 999). Do not make the call.
   - Call `search_recent_posts`/`search_posts_all` with: `query`, `since_id` = lastSeenId, `max_results` 25+,
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
6. Photos: for each `photoCandidates` entry, download the image and LOOK at it.
   - One named adult, plain headshot / booking photo, no text card, no other people:
     `node scripts/x-photo.mjs <rowId> <pbs.twimg.com/media url> --reviewed "Viewed image: <what you saw>"`
   - Otherwise: `node scripts/x-photo.mjs <rowId> --none "<why>"` (graphic, arrest scene, several people, ...).
   - Never a reporter/news image, never a minor, never a held row (the script refuses these anyway).
   - Then `node scripts/write-meta.mjs` to refresh the photo count (keeps lastAdded).
7. Check: `npm test && node scripts/validate.mjs && node scripts/dedupe.mjs data/harvest.json data/review.json`
8. Commit only if something changed (`git status --short`), `git pull --rebase`, then
   `git -c credential.helper='!gh auth git-credential' push`.
9. `gh workflow run hourly-harvest.yml -R krennic212/invasionupdate-data`, `gh run watch <id>`, then curl
   `https://krennic212.github.io/invasionupdate-data/harvest.json` and `harvest-meta.json` (retry; Pages lags).
10. Report the run's X call count (`node scripts/x-usage.mjs status`).

Typical quiet 30-minute run: 5 calls (one per query, no second page) + 0-1 refetch = ~6 calls,
~288/day at 48 runs. Stop paging early once results reach lastSeenId.
