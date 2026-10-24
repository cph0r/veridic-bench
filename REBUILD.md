# Rebuilding an app from its specs

Can an agent that has only the specs Veridic keeps rebuild the app, in another stack, so it
behaves the same? One app so far: the RealWorld Conduit API
([node-express-realworld-example-app](https://github.com/gothinkster/node-express-realworld-example-app)
at `30b68e1`, TypeScript, Express, Prisma). 2026-10-24, Veridic `rebuild-fidelity` branch.

## How it was run

1. **Specs.** Four parts (articles, auth, profiles, tags), a product spec (4 journeys,
   guarantees) and an environment spec. Each rule has worked examples (request and expected
   answer), and each part has a generated data section: tables, columns, keys and
   many-to-many links, from the Prisma schema.
2. **The original first.** RealWorld ran locally (Postgres in Docker). A seed script made two
   users, an article and a comment through the API. `veridic conform` ran the checks the
   specs give. Every failure was fixed in the specs, the seed, or Veridic, until the original
   passed them all.
3. **The rebuild.** A fresh agent got only `specs/` and [PROMPT.md](rebuild/realworld/PROMPT.md).
   It had no code, no tests and no web. It built the API in Node with Fastify and plain SQL
   through `pg` (the original uses Express and Prisma). That took 11 tool calls and 3 minutes:
   [app/server.js](rebuild/realworld/app/server.js), 586 lines.
4. **Three measures**, run by [run.mjs](rebuild/realworld/run.mjs) against both:
   - **Visible:** the 48 checks `veridic conform` generated. The rebuilder saw the examples
     these come from.
   - **Held-out:** 22 rows written from the rules' text alone, never shown to the rebuilder:
     the demo-user filter, slug clashes, partial updates, hidden comments, the feed after a
     follow, a password change, deletes.
   - **Compare:** 20 edge requests to both APIs, checking that the status and the body's
     shape match: bad paging, unknown records, bad tokens, empty bodies.

## Results

| | Original | Rebuild |
|---|---|---|
| Visible: signed out | 12/12 | 12/12 |
| Visible: another user refused | 3/3 | 3/3 |
| Visible: worked examples | 29/29 | 29/29 |
| Visible: journeys | 4/4 | 4/4 |
| Held-out rows | 22/22 | 22/22 |
| Edge requests answered the same | | 3/20 |

Everything the specs state, the rebuild does, including what was never shown to it as an
example. Where the specs say nothing, it differs. The 17 differences:

| Requests | Original | Rebuild | Gap |
|---|---|---|---|
| 5: any article, comment or profile with its author | `image` is a URL | `image: null` | **Data.** The schema's default (`@default("https://…")`) was lost: Veridic cut Prisma comments at `//` even inside a string. Fixed in Veridic (f55bc2e). |
| 7: bad paging, comment on or favourite an unknown article, follow an unknown user, a taken username on update, an empty create or login body | 500 | 400, 404 or 422 | **The original's crashes.** The specs list most of them as risks (RISK-1, RISK-2, RISK-7, the profiles risk), and guarantees G-004 and G-005 promise a 404. The rebuild did what the guarantees promise. A spec has to say whether a rebuild copies the bug. |
| 1: comments of an unknown article | 200 | 404 | Same as above: guarantee G-005, which the original breaks. |
| 2: a bad token | `{ status, message }` | `{ errors: { authorization } }` | **Contract.** The error handler's body isn't in any spec. |
| 2: not found (profile, comment) | `{}` | `{ errors: { … } }` | **Contract.** The same: 404 bodies aren't specified. |

## What the specs lack

- **Error bodies.** Rules give status codes but not what the error handler sends. That covers
  4 of the 17 differences. A generated "Errors" section, from the app's error handler, would
  close them.
- **Whether a rebuild should copy known bugs.** That covers 8 of the 17. The specs already find them
  (risks, and guarantees the original breaks). They should say, per bug, "the original does X;
  rebuilds should do Y".
- **Data the reader dropped.** The 5 `image` differences came from one reader bug, now fixed.

Fixed in Veridic along the way, each with a test: conform sent signed-out checks to optional
sign-in routes; "another user is refused" was guessed from the caller's id being used (anyone
may favourite), so it now comes only from spec rows; `{{unique}}` and seeded `{{name}}` values
in rows; rendered specs never got their data section; the environment spec missed Prisma's
`DATABASE_URL` and Postgres; Prisma's many-to-many links weren't read.

## Run it

```bash
# the original (or any rebuild) running on localhost
node rebuild/realworld/run.mjs --veridic ../veridic --url http://127.0.0.1:3410 --compare http://127.0.0.1:3399
```

Results from this run: [original.json](rebuild/realworld/original.json), [rebuild.json](rebuild/realworld/rebuild.json).
One app, one rebuild, one agent run: a first data point, not a rate.
