# Held-out checks

Rows written from the rules' text, never shown to the rebuilding agent. Destructive rows last.

## Requirements

- **FR-001**: articles:FR-001/FR-002 (the author filter; others don't see a non-demo author's articles) [evidence: x:1]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | GET /api/articles?author={{username}} as owner | 200, articlesCount: 1 | not yet |
    | GET /api/articles?author={{username}} as other | 200, articlesCount: 0 | not yet |
    | GET /api/articles?tag=conform as owner | 200, articlesCount: 1 | not yet |

- **FR-002**: articles:FR-005 (a used slug is refused) [evidence: x:1]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | POST /api/articles { article: { title: "{{title}}", description: "d", body: "b" } } as owner | 422, errors.title: ["must be unique"] | not yet |

- **FR-003**: articles:FR-007 (every article response) [evidence: x:1]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | GET /api/articles/:slug as owner | 200, article.favorited: false, article.favoritesCount: 0, article.tagList: ["conform"], article.author.following: false, article.title: "{{title}}" | not yet |

- **FR-004**: articles:FR-010 (only the given fields change) [evidence: x:1]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | PUT /api/articles/:slug { article: { description: "new description" } } as owner | 200, article.description: "new description", article.title: "{{title}}", article.slug: "{{slug}}", article.body: "b" | not yet |

- **FR-005**: articles:FR-012 (comments by others' non-demo authors are hidden) [evidence: x:1]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | GET /api/articles/:slug/comments as other | 200, comments: [] | not yet |
    | GET /api/articles/:slug/comments as owner | 200, comments.0.body: "First" | not yet |

- **FR-006**: articles:FR-003 with profiles:FR-002 (the feed after following) [evidence: x:1]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | GET /api/articles/feed as other | 200, articlesCount: 0 | not yet |
    | POST /api/profiles/:username/follow as other | 200, profile.following: true | not yet |
    | GET /api/articles/feed as other | 200, articlesCount: 1, articles.0.slug: "{{slug}}", articles.0.author.following: true | not yet |

- **FR-007**: tags:FR-001 (only demo users' or the caller's tags) [evidence: x:1]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | GET /api/tags as other | 200, tags: [] | not yet |

- **FR-008**: auth:FR-002, FR-003, FR-009 [evidence: x:1]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | POST /api/users { user: { email: "u{{unique}}@example.test", username: "   ", password: "pw" } } as anon | 422, errors.username: ["can't be blank"] | not yet |
    | POST /api/users { user: { email: "u{{unique}}@example.test", username: "{{username}}", password: "pw" } } as anon | 422, errors.username: ["has already been taken"] | not yet |
    | POST /api/users/login { user: { email: "nobody-{{unique}}@example.test", password: "pw" } } as anon | 403 | not yet |

- **FR-009**: auth:FR-012 (empty fields are ignored; a new password works) [evidence: x:1]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | PUT /api/user { user: { bio: "" } } as other | 200, user.bio: null, user.username: "{{other_username}}" | not yet |
    | PUT /api/user { user: { password: "new-{{password}}" } } as owner | 200 | not yet |
    | POST /api/users/login { user: { email: "{{email}}", password: "new-{{password}}" } } as anon | 200 | not yet |
    | POST /api/users/login { user: { email: "{{email}}", password: "{{password}}" } } as anon | 403 | not yet |

- **FR-010**: articles:FR-014, FR-011 (the author deletes) [evidence: x:1]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | DELETE /api/articles/:slug/comments/:id as owner | 200 | not yet |
    | DELETE /api/articles/:slug as owner | 204 | not yet |
    | GET /api/articles/:slug as owner | 404 | not yet |
