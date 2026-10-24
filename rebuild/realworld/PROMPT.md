You are rebuilding a web API from its specifications alone. You have never seen its code.

Everything you may read is in ./specs/ (one folder per part: articles, auth, profiles, tags; product/spec.md for the journeys; environment/spec.md for configuration). The specs cite source files (`[evidence: src/...]`) that you do not have: ignore those paths. Do not read, search or list anything outside ./ (no other folders on this machine, no web), and do not look for the original project.

Build the API in ./app/ with Node.js, Fastify and the `pg` driver (plain SQL; no Prisma, no Express). Any other npm packages are fine (bcryptjs, jsonwebtoken, slugify...). Install with `npm install --ignore-scripts`.

- Same HTTP API as the specs describe: same paths (mounted under /api), methods, request and response JSON shapes, status codes, error bodies and auth scheme.
- Configuration from the environment: PORT, DATABASE_URL, JWT_SECRET (default as the environment spec says).
- Create the database schema yourself on startup if it isn't there (the data sections give tables, columns, keys and many-to-many links).
- An empty Postgres database is ready: DATABASE_URL=postgresql://postgres:rw@127.0.0.1:55499/rebuild. Use only that database.
- To try it, run the server on 127.0.0.1 port 3410 only, and stop it before you finish. `npm start` must start the server.

It will be checked black-box over HTTP against the specs, including behaviour described only in the rules' text. Where a spec is unclear, choose what the rules most plausibly mean, and note it.

Finish with a short report: what you built, how to start it, every place the specs were ambiguous or silent and what you chose, and anything you couldn't do.
