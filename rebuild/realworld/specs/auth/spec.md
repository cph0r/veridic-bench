# Auth

Registration, login, and reading and updating the current user.

## Requirements

- **FR-001**: The registration route (POST users) MUST be callable without authentication and MUST create the user from `req.body.user` with `demo` forced to `false`, responding 201 with `{ user }`. [evidence: src/app/routes/auth/auth.controller.ts:14-21]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | POST /api/users { user: { email: "u{{unique}}@example.test", username: "u{{unique}}", password: "pw{{unique}}" } } as anon | 201 | not yet |

- **FR-002**: Registration MUST trim email, username and password and MUST reject a blank one with 422 and "can't be blank" on that field. [evidence: src/app/routes/auth/auth.service.ts:39-54]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | POST /api/users { user: { email: " ", username: "u{{unique}}", password: "pw" } } as anon | 422, errors.email: ["can't be blank"] | not yet |

- **FR-003**: Registration MUST reject an email or username already in use with 422 and "has already been taken" on each field that collides. [evidence: src/app/routes/auth/auth.service.ts:9-36, src/app/routes/auth/auth.service.ts:56-56]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | POST /api/users { user: { email: "{{email}}", username: "u{{unique}}", password: "pw" } } as anon | 422, errors.email: ["has already been taken"] | not yet |

- **FR-004**: Registration MUST store the password as a bcrypt hash (cost 10), never in clear text. [evidence: src/app/routes/auth/auth.service.ts:58-64]
- **FR-005**: Registration MUST return id, email, username, bio, image and a signed token for the new user. [evidence: src/app/routes/auth/auth.service.ts:69-81]
- **FR-006**: The login route (POST users, login) MUST be callable without authentication and MUST respond with `{ user }` on success. [evidence: src/app/routes/auth/auth.controller.ts:30-37]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | POST /api/users/login { user: { email: "{{email}}", password: "{{password}}" } } as anon | 200, user.username: "{{username}}" | not yet |

- **FR-007**: Login MUST trim email and password and MUST reject a blank one with 422 and "can't be blank". [evidence: src/app/routes/auth/auth.service.ts:85-94]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | POST /api/users/login { user: { email: "{{email}}", password: "" } } as anon | 422, errors.password: ["can't be blank"] | not yet |

- **FR-008**: Login MUST compare the password against the stored bcrypt hash, and on success return email, username, bio, image and a token. [evidence: src/app/routes/auth/auth.service.ts:96-121]
- **FR-009**: Login MUST respond 403 with the `email or password` error `is invalid` both when the email is unknown and when the password does not match. [evidence: src/app/routes/auth/auth.service.ts:110-128]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | POST /api/users/login { user: { email: "{{email}}", password: "wrong" } } as anon | 403 | not yet |

- **FR-010**: The current-user GET route MUST require a valid token and MUST return the user whose id is in the token, with a freshly generated token. [evidence: src/app/routes/auth/auth.controller.ts:45-52, src/app/routes/auth/auth.service.ts:131-149]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | GET /api/user as owner | 200, user.username: "{{username}}" | not yet |

- **FR-011**: The user PUT route MUST require a valid token and MUST update only the user whose id is in the token. [evidence: src/app/routes/auth/auth.controller.ts:61-68, src/app/routes/auth/auth.service.ts:159-162]
- **FR-012**: Update MUST change only the fields supplied and non-empty among email, username, password, image and bio, hashing a new password with bcrypt, and MUST return the user with a fresh token. [evidence: src/app/routes/auth/auth.service.ts:152-182]
  - Examples:

    | Given | Then | Proven by |
    |---|---|---|
    | PUT /api/user { user: { bio: "Conform bio" } } as owner | 200, user.bio: "Conform bio" | not yet |

- **FR-013**: Tokens MUST be JWTs carrying `{ user: { id } }` that expire after `60d`. [evidence: src/app/routes/auth/token.utils.ts:3-6]
- **FR-014**: Protected routes MUST read the token from an `authorization` header with the `Token` or `Bearer` scheme and verify it as HS256. [evidence: src/app/routes/auth/auth.ts:4-19]
- **FR-015**: Errors MUST be carried as `HttpException` with a status code and an `errors` body, passed to the error handler via `next`. [evidence: src/app/models/http-exception.model.ts:1-10, src/app/routes/auth/auth.service.ts:28-35, src/app/routes/auth/auth.controller.ts:18-20]
- **INV-1**: Email and username are unique across users (holds: no). The database enforces it, but update does not check uniqueness first, so a colliding update fails in Prisma rather than returning the 422 that registration gives. [evidence: src/prisma/schema.prisma:45-46, src/app/routes/auth/auth.service.ts:159-169]
- **INV-2**: Passwords are never stored or returned in clear text (holds: yes). Hashing happens before every write, and no select on registration, current-user or update includes the password. [evidence: src/app/routes/auth/auth.service.ts:58-76, src/app/routes/auth/auth.service.ts:155-177]

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

- **Risk**: Update does not check email or username uniqueness and does not trim or reject blank values, unlike registration. A collision raises a database error, not a 422. [evidence: src/app/routes/auth/auth.service.ts:151-169]
- **Risk**: The JWT secret falls back to the hard-coded `superSecret` when `JWT_SECRET` is unset, in both signing and verification. Anyone who knows it can forge tokens. [evidence: src/app/routes/auth/token.utils.ts:4-4, src/app/routes/auth/auth.ts:16-16]
- **Risk**: `getCurrentUser` dereferences `user.id` without a null check, so a valid token for a deleted user raises a TypeError, not a 401 or 404. [evidence: src/app/routes/auth/auth.service.ts:131-148]
- **Open question**: Login failure returns 403 rather than the more usual 401. Is that intended? [evidence: src/app/routes/auth/auth.service.ts:124-128]
- **Risk**: No route in this module has a test that calls it. Only the service test reaches the code. [evidence: src/app/routes/auth/auth.controller.ts:14-68]
