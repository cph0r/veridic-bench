# Articles

Articles, their comments and favorites for the RealWorld API. Routes are written as the router declares them, mounted under /api.

## Requirements

- **FR-001**: `GET /articles` MUST be callable without signing in, and MUST return `{articles, articlesCount}` ordered by `createdAt` descending, with `offset` defaulting to 0 and `limit` to 10. [evidence: src/app/routes/article/article.controller.ts:30-37] [evidence: src/app/routes/article/article.service.ts:69-111]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | GET /api/articles as anon | 200 | not yet |

- **FR-002**: `GET /articles` MUST only match articles whose author is a demo user or the caller, and MUST narrow by the `author` (username), `tag` (tag name) and `favorited` (username of a favoriter) query parameters when given. [evidence: src/app/routes/article/article.service.ts:8-67] [evidence: src/app/routes/article/article.controller.ts:30-37]
- **FR-003**: `GET /articles/feed` MUST require sign-in and MUST return only articles whose author is followed by the caller, newest first, with `offset` defaulting to 0 and `limit` to 10. [evidence: src/app/routes/article/article.controller.ts:45-60] [evidence: src/app/routes/article/article.service.ts:113-160]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | GET /api/articles/feed as owner | 200, articlesCount: 0 | not yet |

- **FR-004**: `POST /articles` MUST require sign-in, and MUST reject a missing title, description or body with 422 and a "can't be blank" error for that field. [evidence: src/app/routes/article/article.controller.ts:71-78] [evidence: src/app/routes/article/article.service.ts:162-176]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | POST /api/articles { article: { description: "d", body: "b" } } as owner | 422, errors.title: ["can't be blank"] | not yet |
    | POST /api/articles { article: { title: "t", body: "b" } } as owner | 422, errors.description: ["can't be blank"] | not yet |

- **FR-005**: Creating an article MUST derive its slug as the slugified title followed by `-` and the author's user id, and MUST reject an already used slug with 422 "must be unique". [evidence: src/app/routes/article/article.service.ts:178-191]
- **FR-006**: Creating an article MUST attach the given tags (creating missing ones), connect the caller as author, and respond 201 with `{article}`. [evidence: src/app/routes/article/article.service.ts:193-238] [evidence: src/app/routes/article/article.controller.ts:71-78]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | POST /api/articles { article: { title: "Conform {{unique}}", description: "d", body: "b", tagList: ["conform"] } } as owner | 201, article.tagList: ["conform"], article.author.username: "{{username}}" | not yet |

- **FR-007**: Every article response MUST contain slug, title, description, body, tag names, timestamps, `favorited` for the caller, `favoritesCount`, and the author as a profile with `following` for the caller. [evidence: src/app/routes/article/article.mapper.ts:3-14] [evidence: src/app/routes/article/author.mapper.ts:3-10]
- **FR-008**: `GET /articles/:slug` MUST be callable without signing in and MUST respond 404 "not found" for an unknown slug. [evidence: src/app/routes/article/article.controller.ts:87-98] [evidence: src/app/routes/article/article.service.ts:241-274]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | GET /api/articles/:slug as anon | 200, article.slug: "{{slug}}" | not yet |
    | GET /api/articles/no-such-article-0 as anon | 404 | not yet |

- **FR-009**: `PUT /articles/:slug` MUST require sign-in, respond 404 for an unknown slug and 403 when the caller is not the author. [evidence: src/app/routes/article/article.controller.ts:110-121] [evidence: src/app/routes/article/article.service.ts:289-314]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | PUT /api/articles/:slug { article: { body: "changed" } } as other | 403 | not yet |
    | PUT /api/articles/no-such-article-0 { article: { body: "x" } } as owner | 404 | not yet |

- **FR-010**: Updating an article MUST change only the title, body and description that are given, recompute the slug from a new title (rejecting a clash with 422 "must be unique"), and replace the tag list. [evidence: src/app/routes/article/article.service.ts:316-358] [evidence: src/app/routes/article/article.service.ts:276-287]
- **FR-011**: `DELETE /articles/:slug` MUST require sign-in, respond 404 for an unknown slug, 403 when the caller is not the author, and otherwise delete the article and respond 204. [evidence: src/app/routes/article/article.controller.ts:129-140] [evidence: src/app/routes/article/article.service.ts:385-414]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | DELETE /api/articles/:slug as other | 403 | not yet |
    | DELETE /api/articles/no-such-article-0 as owner | 404 | not yet |

- **FR-012**: `GET /articles/:slug/comments` MUST be callable without signing in and MUST list only comments written by demo users or the caller, each with the author's `following` for the caller. [evidence: src/app/routes/article/article.controller.ts:149-160] [evidence: src/app/routes/article/article.service.ts:416-471]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | GET /api/articles/:slug/comments as owner | 200 | not yet |

- **FR-013**: `POST /articles/:slug/comments` MUST require sign-in, reject an empty body with 422 "can't be blank", and create the comment with the caller as author. [evidence: src/app/routes/article/article.controller.ts:170-181] [evidence: src/app/routes/article/article.service.ts:473-525]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | POST /api/articles/:slug/comments { comment: { body: "" } } as owner | 422, errors.body: ["can't be blank"] | not yet |
    | POST /api/articles/:slug/comments { comment: { body: "Nice" } } as other | 200, comment.body: "Nice" | not yet |

- **FR-014**: `DELETE /articles/:slug/comments/:id` MUST require sign-in and MUST delete the comment only when it exists and was written by the caller, otherwise responding 404; on success it responds 200 with `{}`. [evidence: src/app/routes/article/article.controller.ts:190-201] [evidence: src/app/routes/article/article.service.ts:527-560]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | DELETE /api/articles/:slug/comments/:id as other | 404 | not yet |

- **FR-015**: `POST /articles/:slug/favorite` MUST require sign-in, add the caller to the article's favoriters and return the article with `favorited` and `favoritesCount`. [evidence: src/app/routes/article/article.controller.ts:210-221] [evidence: src/app/routes/article/article.service.ts:562-606]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | POST /api/articles/:slug/favorite as other | 200, article.favorited: true, article.favoritesCount: 1 | not yet |

- **FR-016**: `DELETE /articles/:slug/favorite` MUST require sign-in, remove the caller from the article's favoriters and return the article with `favorited` and `favoritesCount`. [evidence: src/app/routes/article/article.controller.ts:230-241] [evidence: src/app/routes/article/article.service.ts:608-652]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | DELETE /api/articles/:slug/favorite as other | 200, article.favorited: false, article.favoritesCount: 0 | not yet |

- **FR-017**: Failures raised as `HttpException` MUST carry their status code and body to the error handler via `next(error)`. [evidence: src/app/models/http-exception.model.ts:1-10] [evidence: src/app/routes/article/article.controller.ts:71-78]

## Data (generated)

### Article [evidence: src/prisma/schema.prisma:11-24~b421bff3]

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | Int | no | autoincrement() | primary |
| slug | String | no | | unique |
| title | String | no | | |
| description | String | no | | |
| body | String | no | | |
| createdAt | DateTime | no | now() | |
| updatedAt | DateTime | no | now() | |
| authorId | Int | no | | → User.id |

Many-to-many: tagList ↔ Tag; favoritedBy ↔ User (UserFavorites).

### Comment [evidence: src/prisma/schema.prisma:26-35~57ab26f5]

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | Int | no | autoincrement() | primary |
| createdAt | DateTime | no | now() | |
| updatedAt | DateTime | no | now() | |
| body | String | no | | |
| articleId | Int | no | | → Article.id |
| authorId | Int | no | | → User.id |

### Tag [evidence: src/prisma/schema.prisma:37-41~6ec6fba7]

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | Int | no | autoincrement() | primary |
| name | String | no | | unique |

Many-to-many: articles ↔ Article.

## Invariants

- **INV-1**: Only an article's author can update or delete it (holds: yes). [evidence: src/app/routes/article/article.service.ts:310-314] [evidence: src/app/routes/article/article.service.ts:404-408]
- **INV-2**: Only a comment's author can delete it (holds: yes). [evidence: src/app/routes/article/article.service.ts:527-547]
- **INV-3**: A comment is only ever attached to an existing article (holds: no). `addComment` does not check that the slug resolved, and connects on `article?.id`, so an unknown slug reaches Prisma with an undefined id instead of a 404. [evidence: src/app/routes/article/article.service.ts:478-494]
- **INV-4**: An unknown slug always yields a 404 (holds: no). Favorite and unfavorite update by slug without a lookup, so Prisma's not-found error surfaces instead. [evidence: src/app/routes/article/article.service.ts:562-573] [evidence: src/app/routes/article/article.service.ts:608-619]

## Risks and open questions

- **RISK-1**: Commenting on an unknown slug is not turned into a 404 (see INV-3). [evidence: src/app/routes/article/article.service.ts:478-494]
- **RISK-2**: Favoriting or unfavoriting an unknown slug is not turned into a 404 (see INV-4). [evidence: src/app/routes/article/article.service.ts:562-573]
- **RISK-3**: Comment deletion does not check the `:slug` in the path; the comment is matched by id and author only, so it can be deleted through any article's URL. The 403 branch after the lookup is unreachable. [evidence: src/app/routes/article/article.service.ts:527-553]
- **RISK-4**: Slugs end in the author's id, so two authors can use the same title but one author cannot reuse a title. Open question whether the uniqueness message is intended. [evidence: src/app/routes/article/article.service.ts:178-191]
- **RISK-5**: Listing and comments hide content from non-demo authors other than the caller, which may be unintended for a public listing. [evidence: src/app/routes/article/article.service.ts:13-25] [evidence: src/app/routes/article/article.service.ts:419-431]
- **RISK-6**: `updateArticle` clears the tag list before the update, outside a transaction, so a failure in between loses tags. [evidence: src/app/routes/article/article.service.ts:343-358]
- **RISK-7**: Feed and list `offset`/`limit` are not validated; a non-numeric feed value becomes NaN and falls back to the defaults. [evidence: src/app/routes/article/article.controller.ts:50-54]
