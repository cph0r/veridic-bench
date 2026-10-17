# Recall on documented vulnerabilities

Two deliberately insecure apps publish their flaws. Each flaw that lives in a
route's design (who can call it, whose data it touches, what a GET does) is
mapped to its route; flaws a route-level check can't see (SQL injection, XSS,
frontend-only, cryptography) are out of scope and not counted.

## OWASP Juice Shop (`data/static/challenges.yml`)

| Challenge | Route | First run | Now |
|---|---|---|---|
| Change Bender's Password | `GET /rest/user/change-password` | flagged: GET that writes | flagged |
| View Basket | `GET /rest/basket/:id` | flagged (GET that writes) | flagged: reads any user's basket |
| Payback Time | `POST /rest/basket/:id/checkout` | flagged: basket id not scoped | flagged: also charges the wallet the body names |
| Forged Review | `PUT /rest/products/:id/reviews` | flagged (for the product id) | flagged: author from the body |
| Manipulate Basket | `PUT /api/BasketItems/:id` | missed | flagged: BasketId from the body |
| Forged Feedback | `POST /api/Feedbacks` | missed | missed (the write happens in a generated route) |
| Deluxe Fraud | `POST /rest/deluxe-membership` | missed | missed (a business-logic flaw: payment can be skipped) |
| Five-Star Feedback | `DELETE /api/Feedbacks/:id` | not visible | not visible: generated at run time by `finale-rest` |
| Product Tampering | `PUT /api/Products/:id` | not visible | not visible: generated at run time by `finale-rest` |

**4 of 9 on first run, 5 of 9 now; 5 of the 7 that exist in the source.**

## OWASP NodeGoat (holdout: its flaw list was read only after the Juice Shop work)

| Flaw | Route | First run | Now |
|---|---|---|---|
| A4 Insecure direct object reference | `GET /allocations/:userId` | missed (the handler also reads the session, so it looked scoped) | flagged: uses the URL's user id, never compared with the caller's |
| A7 Missing function-level access control | `GET`/`POST /benefits` | missed from code alone | flagged with a 3-line `--intended` policy (benefits need a role) |

Not counted: A1 injection, A2/A3 session and XSS, A5 misconfiguration, A6 data
exposure, A8 CSRF, A9/A10 components and redirects.
