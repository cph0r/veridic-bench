# Product: Conduit

A place to write articles, follow the writers you like, and talk about what they post.

## Journeys

### J-001: Join and sign in

1. A person registers with an email, a username and a password (auth:FR-001, auth:FR-002, auth:FR-003)
2. They're signed in with a token that lasts sixty days (auth:FR-005, auth:FR-013)
3. Later they sign in again with the same email and password (auth:FR-006, auth:FR-008)

### J-002: Write an article

1. A signed-in writer posts a title, a description and a body (articles:FR-004)
2. The article gets its own address and its tags (articles:FR-005, articles:FR-006)
3. Anyone can read it, signed in or not (articles:FR-008, articles:FR-001)

### J-003: Follow the conversation

1. A reader comments on an article (articles:FR-013)
2. They favourite the articles they like (articles:FR-015, articles:FR-016)
3. They follow the writers they like, and their feed shows what those writers publish (profiles:FR-002, articles:FR-003)

### J-004: Keep a profile up to date

1. A person changes their bio, image or password (auth:FR-011, auth:FR-012)
2. Their new details show the next time they sign in (auth:FR-010)

## Guarantees

- **G-001**: Only the author edits: an article can only be changed or deleted by the person who wrote it [rules: articles:INV-1, articles:FR-009, articles:FR-011]
- **G-002**: Comments stay with their writer: only the person who wrote a comment can delete it [rules: articles:INV-2, articles:FR-014]
- **G-003**: Passwords are never shown: they're stored hashed and never returned [rules: auth:INV-2, auth:FR-004]
- **G-004**: Comments belong to real articles: a comment is only ever attached to an article that exists [rules: articles:INV-3, articles:FR-013]
- **G-005**: Unknown articles are not found: an address no article has always answers 404 [rules: articles:INV-4, articles:FR-008]
