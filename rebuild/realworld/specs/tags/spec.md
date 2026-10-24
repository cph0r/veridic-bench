# Tags

The popular tags list. Routes are written as the router declares them, mounted under /api.

## Requirements

- **FR-001**: `GET /tags` MUST be callable without signing in and MUST return `{ tags }`: the names of at most 10 tags used by articles of demo users or of the caller, most used first. [evidence: src/app/routes/tag/tag.controller.ts:13-20] [evidence: src/app/routes/tag/tag.service.ts:4-38]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | GET /api/tags as anon | 200, tags: [] | not yet |
    | GET /api/tags as owner | 200, tags: ["conform"] | not yet |

## Data (generated)

### Tag [evidence: src/prisma/schema.prisma:37-41~6ec6fba7]

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | Int | no | autoincrement() | primary |
| name | String | no | | unique |

Many-to-many: articles ↔ Article.
