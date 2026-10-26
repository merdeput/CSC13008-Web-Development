# Dish Search Audit Report

**Date:** 2026-10-26  
**Scope:** Source and migration review with read-only API checks before and after the search fix. The implementation adds one additive migration; existing rows were not changed.

## Summary

The public menu uses PostgreSQL full-text search for dish names, descriptions, and ingredient names, with fuzzy matching as a fallback. The search now folds Vietnamese accents for full-text and fuzzy comparisons, ranks stronger field matches first, and limits fuzzy description matching to longer multiword queries. Search parameters remain bound, and public results remain limited to published dishes.

The baseline audit found noisy accent-free and fuzzy results. After the fix, `pho` returns 67 results led by Phở dishes, `pho dac biet` returns only Phở đặc biệt, and typo queries return smaller relevant result sets. The database migration was applied successfully; it adds a text-search configuration and indexes without changing existing rows.

Dynamic checks were performed with read-only `GET` requests against the current local API at `http://localhost:3000`, at the user's request. No seed, cleanup, or write request was used. The API returned current menu data (`total: 1022`).

## Implementation map

| Area | Evidence | Observed behavior |
|---|---|---|
| Route | `server/src/routes/public-routes.js:14`; mounted at `/api` in `server/src/app.js:34` | Public search endpoint is `GET /api/menu`. |
| HTTP handler | `server/src/handlers/public-handlers.js:13-19` | Accepts string `q`, trims and truncates it to 100 characters, and returns `{ ok: true, data: { ...result, categories } }`. |
| Service | `server/src/services/dish-service.js:86-103` | Validates category IDs, caps `q` at 100 characters, validates `pageSize` in the range 1–100, then calls the public model. |
| Public query | `server/src/models/dish-model.js:30-145` | Uses accent-aware full-text candidates and weighted match tiers. Fuzzy name/ingredient comparisons require at least 4 characters; fuzzy descriptions require a longer multiword query. Quoted phrases skip fuzzy candidates. |
| Admin query | `server/src/models/dish-model.js:123-149` | Uses Prisma case-insensitive `contains` matching across dish name/description, category name, chef name, and ingredient name. It is separate from public full-text/fuzzy search. |
| Dish schema | `prisma/schema.prisma:28-49` | `Dish` has name, description, publication and availability fields; it has no stored `tsvector` field. No search trigger was found in the schema or migrations. |

## Baseline search behavior (before fixes)

### Public menu

- Blank or whitespace-only `q` follows the non-search list path (`dish-model.js:22-24, 113-118`). That path orders published dishes by featured status, name, and ID.
- Full-text search uses `websearch_to_tsquery('simple', ...)` (`dish-model.js:61-71`). It searches a combined dish-name/description vector and a separate ingredient-name vector (`dish-model.js:65-83`). It does not search category or chef names.
- The fuzzy branch runs only when `searchText.length >= 3` (`dish-model.js:28`). It uses `%`/`similarity()` for dish names and ingredient names, and `<%`/`word_similarity()` for descriptions (`dish-model.js:31-59`). Short queries still use full-text search; they simply skip fuzzy candidates.
- Candidate rows are grouped by dish ID; `bool_or(exact_match)` and `max(similarity_score)` combine duplicate paths (`dish-model.js:86-90`). Results are ordered by that boolean, score, featured status, name, and ID (`dish-model.js:94-100`).
- The column named `exact_match` is set to `true` for **all full-text matches**, including matches from a description or ingredient (`dish-model.js:65-83`). It does not check for an exact dish-name equality. There is no `ts_rank`/`ts_rank_cd` calculation in the repository search code.
- The public path always filters `isPublished = true` (`dish-model.js:35, 45, 57, 69, 81, 113`). It does not filter `isAvailable`; a published, temporarily unavailable dish can still appear. Category filtering is applied to public and fuzzy candidates when supplied.
- Search count is calculated before pagination (`dish-model.js:91-104`). `pageResult` returns `items`, `total`, `page`, `pageSize`, and `pageCount`; page count is at least 1, including for an empty result (`server/src/services/pagination.js:8-10`).
- Query text and category ID are inserted through Prisma’s tagged SQL template, not concatenated into SQL (`dish-model.js:25-27, 61-63`). The search parser is `websearch_to_tsquery`, not raw `to_tsquery`. Invalid or unknown category IDs are handled in the service before the model query (`dish-service.js:87-88`).

### Admin dish search

Admin search is substring matching and searches additional related text fields (`dish-model.js:123-149`). It is not fuzzy ranking and does not use the public `websearch_to_tsquery` path. The public trigram indexes are partial indexes for published dishes, so their usefulness for an admin query that includes drafts was not established. No query plan was run.

## Extensions and indexes

| Migration | Definition | Query correspondence |
|---|---|---|
| `prisma/migrations/20261026000000_menu_full_text_search_indexes/migration.sql:1-10` | GIN expression index over `to_tsvector('simple', name || description)` for published dishes; GIN expression index over ingredient names. | Expressions correspond to the public `@@` expressions at `dish-model.js:71, 83`. |
| `prisma/migrations/20261026000000_menu_full_text_search_indexes/migration.sql:12-18` | Partial B-tree indexes for public menu ordering, with and without category ID. | Supports the non-search ordering pattern; planner use was not checked. |
| `prisma/migrations/20261026010000_menu_fuzzy_search_indexes/migration.sql:1-12` | Installs `pg_trgm` in schema `extensions`; GIN trigram indexes on published dish names/descriptions and ingredient names. | These supported the baseline `%`/`<%` query operators ([pg_trgm docs](https://www.postgresql.org/docs/15/pgtrgm.html#PGTRGM-INDEX)). The current accent-normalized fuzzy comparisons use explicit similarity functions and do not use these indexes. |
| `prisma/migrations/20261026020000_menu_accent_aware_relevance_search/migration.sql` | Installs `unaccent`, creates `public.menu_search_unaccent`, and adds GIN indexes for normalized dish names, combined dish text, and ingredient names. | Matches the full-text expressions in the current public model. The migration is additive and leaves existing search indexes/data intact. |

The baseline implementation had no accent normalization, stored vector, or trigger. The new migration adds an `unaccent` text-search dictionary to a custom configuration; PostgreSQL supports using that dictionary in text-search configurations ([unaccent documentation](https://www.postgresql.org/docs/15/unaccent.html)). The current search uses explicit `similarity` score thresholds for fuzzy fallback rather than the `%` and `<%` operators, so the existing trigram GIN indexes are not used by that fallback. The course dataset is small; query-plan and scale performance were not tested.

The application and migrations do not set trigram thresholds. PostgreSQL’s documented defaults are `0.3` for `%` and `0.6` for `<%`; a database/session override could change results ([pg_trgm threshold docs](https://www.postgresql.org/docs/15/pgtrgm.html#PGTRGM-GUC)). The configured values for this project’s database were not checked.

## Baseline static findings (before fixes)

### Medium, conditional: exact dish-name matches are not explicitly ranked first

`server/src/models/dish-model.js:65-83` labels every full-text candidate `exact_match = true`, while fuzzy candidates are false. `dish-model.js:94-100` sorts by that flag before score. Therefore, a full-text match on an ingredient or description receives the same top-tier flag as a dish-name match. Full-text matches then have a score of zero and are ordered by featured status and name, not text relevance. An exact dish-name match is not guaranteed to rank first by explicit logic.

This matters if the expected behavior is “exact dish name first, then other full-text matches, then fuzzy matches.” If that is not a requirement, document the current ranking instead of treating it as a defect.

The follow-up implementation uses normalized full-text vectors and explicit match tiers instead of this sketch:

```sql
CASE
  WHEN lower(d."name") = lower(q.search_text) THEN 2
  WHEN full_text_match THEN 1
  ELSE 0
END AS match_tier
```

Use a relevance score such as `ts_rank` only if ranking between full-text matches is desired; keep ingredient/description match precedence explicit.

### Medium: accent-free Vietnamese query returns unrelated dishes

Dynamic requests showed that `q=phở` returns 67 results, with Phở dishes first, while `q=pho` returns 200 results. The first 12 results were Bánh canh dishes and there was no Phở-named dish among the first 100 returned. The code has no accent normalization, and the fuzzy description branch can match common description words such as “phong.” For a Vietnamese menu, this makes accent-free lookup noisy and hides the likely intended results.

The follow-up implementation adds an accent-normalizing text-search configuration and normalized GIN indexes. It also skips fuzzy description matching for short or single-token input and ranks name/ingredient matches above description candidates.

### Low: fuzzy migration assumes the `extensions` schema exists

`prisma/migrations/20261026010000_menu_fuzzy_search_indexes/migration.sql:1` requests `WITH SCHEMA extensions`, but no migration in the repository creates that schema. PostgreSQL requires a schema named in `CREATE EXTENSION ... SCHEMA` to already exist ([CREATE EXTENSION docs](https://www.postgresql.org/docs/18/sql-createextension.html)). A managed database may provision it, but that was not verified. A clean PostgreSQL setup without the schema could fail at this migration.

Suggested direction for a future migration, **not applied**:

```sql
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
```

Before changing an already-deployed migration history, verify the target database and migration state.

### Baseline note: fuzzy thresholds

The baseline implementation relied on PostgreSQL trigram operator thresholds. The current model uses explicit minimum similarity scores of `0.4` for dish/ingredient fuzzy matches and `0.68` for description fuzzy matches, so result acceptance no longer depends on those operator defaults.

## Baseline dynamic testing

All requests below used `curl.exe` against `http://localhost:3000` and were read-only. No database credentials or connection strings were displayed. The base menu request returned HTTP 200 with `ok: true`, 1,022 total published menu items, 100 returned for `pageSize=100`, 11 pages, and 9 categories.

| PowerShell curl query | HTTP/result | Observation |
|---|---|---|
| `--data-urlencode 'q=Phở đặc biệt'` | 200, 1 result | Exact dish returned first. |
| `--data-urlencode 'q=PHỞ ĐẶC BIỆT'` | 200, 1 result | Case variation returned the same dish. |
| `--data-urlencode 'q=phở'` | 200, 67 results | Phở đặc biệt, Phở gà, and Phở nạm bò led the first page. |
| `--data-urlencode 'q=pho'` with `pageSize=100` | 200, 200 results | First 12 results were Bánh canh dishes; no Phở-named dish appeared in the first 100. Strong false-positive signal for the accent-free short query. |
| `--data-urlencode 'q=Bánh phở'` | 200, 118 results | Ingredient-related results appeared; Phở đặc biệt led the results. |
| `--data-urlencode 'q=gà phở'` | 200, 66 results | Reversed multi-word query returned Phở and chicken dishes among the first results. |
| `--data-urlencode 'q=Phở ga'` | 200, 57 results | Typo-like query returned Phở gà, Phở gà ta, and Phở gà xé first. It also returned a broad result set. |
| `--data-urlencode 'q=ab'` or `'q=x'` | 200, 0 results | No short-query matches in this dataset. |
| `--data-urlencode 'q=zzzzqqq'` | 200, 0 results | Empty list: `items: []`, `total: 0`, `pageCount: 1`. |
| `--data-urlencode 'q=:* & ! ('` | 200, 0 results | Punctuation did not cause a query error. |
| `--data-urlencode "q='; DROP TABLE Dish;--"` | 200, 0 results | SQL-looking text was treated as a query; subsequent menu and admin reads still succeeded. No mutation was requested. |
| `--data-urlencode 'q='` and `'q=   '` | 200, 1,022 results each | Empty/whitespace queries fall back to the full published menu. |
| `--data-urlencode 'q=Bánh canh bò hầm'` | 200, 31 results | Exact-name item was included and was `isPublished: true`, `isAvailable: false`; unavailable published dishes remain searchable. |
| `q=phở`, matching `categoryId` | 200, 4 results | Category filter reduced the results to the four phở-category dishes. |
| `q=phở`, category ID, `pageSize=2`, pages 1 and 2 | 200 each | Both pages reported `total: 4`, `pageCount: 2`; page results did not overlap. |
| `categoryId=not-a-uuid` | 200, `ok: false`, `error.code: NOT_FOUND` | Malformed category filter is reported in the body with HTTP 200. |
| `categoryId=00000000-0000-4000-8000-000000000000` | 200, `ok: false`, `error.code: NOT_FOUND` | Unknown valid UUID also returns HTTP 200. |
| `q=phở`, `pageSize=0` | 200, `ok: false`, `error.code: VALIDATION_FAILED` | Field error correctly identifies `pageSize`, but HTTP status is 200. |
| Admin `isPublished=false`, then public search for `Cao lầu Hội An` | 200 for both | Admin confirmed a draft named Cao lầu Hội An; public search did not return a same-name record. The public search still produced 20 fuzzy/related results for the words. |

Example commands used:

```powershell
$api = 'http://localhost:3000'
curl.exe -i -G "$api/api/menu" --data-urlencode 'q=Phở đặc biệt'
curl.exe -i -G "$api/api/menu" --data-urlencode 'q=pho' --data-urlencode 'pageSize=100'
curl.exe -i -G "$api/api/menu" --data-urlencode 'q=zzzzqqq'
curl.exe -i -G "$api/api/menu" --data-urlencode 'q=phở' --data-urlencode 'pageSize=0'
```

No dedicated search unit/integration test files were found. GIN index usage and execution time remain unverified; no query plan or bulk dataset was generated.

### API behavior finding

`pageSize=0` and malformed/unknown category IDs return HTTP 200 with `{ ok: false, error: { code, message, ... } }`. This differs from a conventional validation/not-found HTTP status and from the simpler string-valued error shape expected in the migration requirements. Clients must inspect `ok` instead of relying on HTTP status alone. The behavior is implemented in `server/src/middleware/error-handler.js` and was confirmed by the requests above.

## Baseline 20-case search check (before fixes)

These additional read-only GET checks were run against the same local API on 2026-10-26. All successful search requests returned HTTP 200 with `ok: true`.

| # | Check | Result |
|---|---|---|
| 1 | Exact dish name: `Phở đặc biệt` | Pass: 1 result; expected dish ranked first. |
| 2 | Uppercase: `PHỞ ĐẶC BIỆT` | Pass: same single dish. |
| 3 | Lowercase accented: `phở đặc biệt` | Pass: same single dish. |
| 4 | Accent-free short query: `pho` | Fail for relevance: 200 results; first five were unrelated Bánh canh dishes, and Phở đặc biệt was absent from the first 100. |
| 5 | Accent-free multiword: `pho dac biet` | Fail for accent-insensitive expectation: 0 results. |
| 6 | One-character variation: `Phở gá` | Pass for recall: Phở gà ranked first; 57 total results. |
| 7 | Inserted character: `Phở gàa` | Pass for recall: Phở gà ranked first; 57 total results. |
| 8 | Spelling variation: `Phơ gà` | Pass for recall: Phở gà ranked first; 5 total results. |
| 9 | Reversed words: `gà phở` | Relevant results returned; Phở đặc biệt ranked first and Phở gà second, with 66 total results. |
| 10 | Quoted phrase: `"Phở gà"` | Phở gà ranked second in 66 results. Quotes did not narrow the overall fuzzy result set to the phrase. |
| 11 | Name fragment: `đặc biệt` | Phở đặc biệt ranked first, but 56 total results. |
| 12 | Partial word: `đặc bi` | Phở đặc biệt was only rank 37 among 56 results; unrelated drinks led the list. |
| 13 | Ingredient: `Bánh phở` | Phở đặc biệt ranked first; 118 total results, so recall is broad. |
| 14 | Ingredient variation: `Bánh phơ` | Phở đặc biệt appeared at rank 54 among 116 results; unrelated Hủ tiếu dishes led the list. |
| 15 | Description phrase copied from current data: `Phở kết hợp tôm` | Pass: Phở đặc biệt ranked first among 5 results. |
| 16 | Description typo: `Phở xết hợp tôm` | Pass for recall: Phở đặc biệt ranked first among 5 results. |
| 17 | Short token: `ga` / `gà` | `ga` returned 0; accented `gà` returned 260, with Phở đặc biệt first and Phở gà second. |
| 18 | Empty and whitespace query | Both returned HTTP 200 and the full 1,022-item published menu. |
| 19 | No-match and punctuation: `zzzzqqq`, `:* & ! (` | Both returned HTTP 200, `ok: true`, and 0 results. |
| 20 | Category, pagination, and admin comparison | With the actual `Các món nước` category ID, public `phở` search returned 4 items across 2 pages, with equal totals and no overlap. Public typo `Phở gá` returned 57 results and included Phở gà; admin typo search returned 0, while admin exact `Phở gà` returned 4 dishes. This confirms the separate substring-based admin search behavior. |

### Baseline interpretation

The typo tests show that fuzzy matching can recover several small misspellings, but broad candidate sets often rank unrelated items ahead of useful matches. Accent-free search remains inconsistent: `pho` is noisy, `pho dac biet` returns no matches, and the short token `ga` returns none while `gà` returns many. The description typo case works for this specific dish and wording; it does not establish general typo quality. The quoted query also remains broad because fuzzy candidates are combined with full-text candidates.

## Post-fix verification

After applying `20261026020000_menu_accent_aware_relevance_search`, the same cases were rerun through read-only GET requests against the current API. The migration completed successfully and did not alter existing rows.

| Cases | Post-fix result |
|---|---|
| 1–3: exact name, uppercase, lowercase accented | All returned the single expected dish at rank 1. |
| 4–5: `pho`, `pho dac biet` | `pho` returned 67 results led by Phở đặc biệt, Phở gà, and Phở nạm bò. `pho dac biet` returned only Phở đặc biệt at rank 1. |
| 6–10: typo, reversed words, quoted phrase | Expected Phở gà was rank 1 for all. Result counts fell from 5–66 in the baseline to 4–20. Quoted search skips fuzzy candidates. |
| 11–12: `đặc biệt`, `đặc bi` | Both returned only Phở đặc biệt at rank 1. |
| 13–14: `Bánh phở`, `Bánh phơ` | Both returned 55 ingredient-related dishes, with Phở đặc biệt at rank 1. |
| 15–16: description phrase and typo | Phở đặc biệt ranked first; result sets contained 3 and 4 dishes. |
| 17: `ga` and `gà` | Both returned 260 results with relevant gà dishes first. |
| 18–19: empty, whitespace, no-match, punctuation, SQL-looking text | Empty/whitespace still returned all 1,022 published dishes. The other probes returned empty results without errors. |
| 20: category, pagination, and admin comparison | Filtered pages had total 4, page count 2, and no overlap. Admin search remains substring-based: typo returned 0, exact `Phở gà` returned 4. |

The fuzzy comparison now uses accent-normalized text with explicit score floors. For this course dataset, these fallback comparisons scan the small dish/ingredient lists; the existing trigram indexes are retained but are not used by those normalized comparisons. No query plan or large-scale performance test was run.

## Remaining considerations

1. The common token `gà` still returns 260 dishes; its relevance should be checked against the intended course-project behavior if users find the list too broad.
2. Public and admin search intentionally remain different: public supports full-text and fuzzy matching, while admin uses case-insensitive substring matching.
3. The earlier fuzzy-search migration still assumes the `extensions` schema exists before it runs on a fresh database. The current database already had the schema; the new migration creates it idempotently before installing `unaccent`.
4. If the dataset grows materially, inspect query plans and consider indexed normalized trigram expressions. No production-scale infrastructure is warranted for the current coursework dataset.
