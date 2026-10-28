# Grok Build prompt: CHNV / DACA / Entered under Biden / Entered under Obama tags (paste as-is)

Show four new tags on the Invasion Update site. The data feed now sets them; the site only has to read and show them.
Do not change layout, the feed fetch URL, the map, the status badge, the existing crime categories, or any wording rules.

## Where the tags are
Every row in the live feed https://krennic212.github.io/invasionupdate-data/harvest.json now has a `tags` field: an
array of strings, often empty. The only values are, in this order:
`"CHNV"`, `"DACA"`, `"Entered under Biden"`, `"Entered under Obama"`.
Example: `"tags": ["CHNV", "Entered under Biden"]`. Use the feed's `tags` exactly as given. Don't work them out from
the text with regex in the site. The feed already applies the rules.

## What to do
1. Add `tags?: string[]` to `CaseRecord` (`src/data/brief.ts`). Wherever feed rows are mapped into `CaseRecord`
   (the harvest.json loader in `src/lib/harvest.ts` or similar), keep `tags` (if it is missing or not an array, use `[]`).
   Bundled cases in `src/data/*.ts` have no tags: treat them as `[]`.
2. Badges: on each person's card (case list / posts feed card, and the expanded case view), show each tag as a
   small pill next to the existing crime tag pills, in the same pill style. Labels: "CHNV", "DACA",
   "Entered under Biden", "Entered under Obama". A card with no tags shows nothing new.
3. Filter chips: add a "Tags" group of four chips next to the existing category filter (CategoryFilter) with the
   same chip styling and count badges. Selecting a chip shows only cases whose `tags` include it. Several chips =
   any of them (same as the categories). Tag chips and category chips combine with AND (a case must match both
   groups when both have a selection). Hide a chip if its count is 0.
4. Search: include the tag labels in the search text blob so typing "DACA" or "Biden" finds tagged cases.

## Check
- A feed row with `"tags": ["DACA"]` (e.g. Mary Angelica Landeros-Quen) shows a DACA badge and appears under the DACA chip.
- A row with `"tags": []` shows no new badge and is hidden whenever any tag chip is selected.
- A row with no `tags` field at all does not crash the page.
