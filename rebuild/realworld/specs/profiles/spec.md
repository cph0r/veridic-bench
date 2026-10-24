# Profiles

Reading a user's public profile, and following or unfollowing them. Routes are written as the router declares them, mounted under /api.

## Requirements

- **FR-001**: `GET /profiles/:username` MUST be callable without signing in, MUST respond 404 for an unknown username, and MUST return `{ profile }` with username, bio, image and `following` (true only when the caller follows that user; false when signed out). [evidence: src/app/routes/profile/profile.controller.ts:14-25] [evidence: src/app/routes/profile/profile.service.ts:5-19] [evidence: src/app/routes/profile/profile.utils.ts:4-11]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | GET /api/profiles/:username as anon | 200, profile.username: "{{username}}", profile.following: false | not yet |
    | GET /api/profiles/no-such-user-0 as anon | 404 | not yet |

- **FR-002**: `POST /profiles/:username/follow` MUST require sign-in, add the caller to that user's followers, and return the profile with `following: true`. [evidence: src/app/routes/profile/profile.controller.ts:34-45] [evidence: src/app/routes/profile/profile.service.ts:21-37]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | POST /api/profiles/:username/follow as other | 200, profile.following: true | not yet |
    | GET /api/profiles/:username as other | 200, profile.following: true | not yet |

- **FR-003**: `DELETE /profiles/:username/follow` MUST require sign-in, remove the caller from that user's followers, and return the profile with `following: false`. [evidence: src/app/routes/profile/profile.controller.ts:54-65] [evidence: src/app/routes/profile/profile.service.ts:39-55]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | DELETE /api/profiles/:username/follow as other | 200, profile.following: false | not yet |

## Data (generated)

### User [evidence: src/prisma/schema.prisma:43-56~a1644725]

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | Int | no | autoincrement() | primary |
| email | String | no | | unique |
| username | String | no | | unique |
| password | String | no | | |
| image | String | yes | | |
| bio | String | yes | | |
| demo | Boolean | no | false | |

Many-to-many: favorites ↔ Article (UserFavorites); followedBy ↔ User (UserFollows); following ↔ User (UserFollows).

## Risks and open questions

- Following or unfollowing an unknown username isn't handled: the database update fails and the error handler answers 500.
