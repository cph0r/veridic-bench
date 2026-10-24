'use strict';
const Fastify = require('fastify');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const slugify = require('slugify');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'superSecret';
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

class HttpException extends Error {
  constructor(status, body) {
    super(typeof body === 'string' ? body : JSON.stringify(body));
    this.status = status;
    this.body = body;
  }
}
const err = (status, field, msg) => new HttpException(status, { errors: { [field]: [msg] } });

// ---------- schema ----------
const SCHEMA = `
CREATE TABLE IF NOT EXISTS "User" (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  image TEXT,
  bio TEXT,
  demo BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS "Article" (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  body TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "authorId" INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "Comment" (
  id SERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  body TEXT NOT NULL,
  "articleId" INTEGER NOT NULL REFERENCES "Article"(id) ON DELETE CASCADE,
  "authorId" INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "Tag" (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS "_ArticleToTag" (
  "A" INTEGER NOT NULL REFERENCES "Article"(id) ON DELETE CASCADE,
  "B" INTEGER NOT NULL REFERENCES "Tag"(id) ON DELETE CASCADE,
  PRIMARY KEY ("A", "B")
);
CREATE TABLE IF NOT EXISTS "_UserFavorites" (
  "A" INTEGER NOT NULL REFERENCES "Article"(id) ON DELETE CASCADE,
  "B" INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  PRIMARY KEY ("A", "B")
);
-- "A" follows "B"
CREATE TABLE IF NOT EXISTS "_UserFollows" (
  "A" INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "B" INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  PRIMARY KEY ("A", "B")
);
`;

// ---------- auth helpers ----------
function signToken(id) {
  return jwt.sign({ user: { id } }, JWT_SECRET, { expiresIn: '60d' });
}
const UNAUTHORIZED = () =>
  err(401, 'authorization', 'missing authorization credentials');

function readAuth(req, required) {
  const h = req.headers.authorization;
  let token = null;
  if (h) {
    const [scheme, value] = h.split(' ');
    if ((scheme === 'Token' || scheme === 'Bearer') && value) token = value;
  }
  if (!token) {
    if (required) throw UNAUTHORIZED();
    return null;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const id = payload && payload.user && payload.user.id;
    if (id === undefined || id === null) throw new Error('bad payload');
    return Number(id);
  } catch (e) {
    throw err(401, 'authorization', 'invalid token');
  }
}
const auth = (req) => readAuth(req, true);
const optAuth = (req) => readAuth(req, false);

const str = (v) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));

// ---------- users ----------
async function userJson(id) {
  const { rows } = await pool.query(
    'SELECT id, email, username, bio, image FROM "User" WHERE id = $1',
    [id]
  );
  if (!rows[0]) throw UNAUTHORIZED();
  return { ...rows[0], token: signToken(rows[0].id) };
}

async function register(input) {
  input = input || {};
  const email = str(input.email).trim();
  const username = str(input.username).trim();
  const password = str(input.password).trim();
  if (!email) throw err(422, 'email', "can't be blank");
  if (!username) throw err(422, 'username', "can't be blank");
  if (!password) throw err(422, 'password', "can't be blank");
  await checkUnique(email, username, null);
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO "User" (email, username, password, image, bio, demo)
     VALUES ($1, $2, $3, $4, $5, false) RETURNING id, email, username, bio, image`,
    [email, username, hash, input.image || null, input.bio || null]
  ).catch(mapUniqueViolation);
  return { ...rows[0], token: signToken(rows[0].id) };
}

async function checkUnique(email, username, exceptId) {
  const errors = {};
  if (email !== undefined) {
    const r = await pool.query('SELECT id FROM "User" WHERE email = $1 AND ($2::int IS NULL OR id <> $2)', [email, exceptId]);
    if (r.rows.length) errors.email = ['has already been taken'];
  }
  if (username !== undefined) {
    const r = await pool.query('SELECT id FROM "User" WHERE username = $1 AND ($2::int IS NULL OR id <> $2)', [username, exceptId]);
    if (r.rows.length) errors.username = ['has already been taken'];
  }
  if (Object.keys(errors).length) throw new HttpException(422, { errors });
}

function mapUniqueViolation(e) {
  if (e && e.code === '23505') {
    const field = /username/.test(e.constraint || e.detail || '') ? 'username' : 'email';
    throw err(422, field, 'has already been taken');
  }
  throw e;
}

async function login(input) {
  input = input || {};
  const email = str(input.email).trim();
  const password = str(input.password).trim();
  if (!email) throw err(422, 'email', "can't be blank");
  if (!password) throw err(422, 'password', "can't be blank");
  const { rows } = await pool.query(
    'SELECT id, email, username, bio, image, password FROM "User" WHERE email = $1',
    [email]
  );
  const u = rows[0];
  if (u && (await bcrypt.compare(password, u.password))) {
    return { email: u.email, username: u.username, bio: u.bio, image: u.image, token: signToken(u.id) };
  }
  throw err(403, 'email or password', 'is invalid');
}

async function updateUser(id, input) {
  input = input || {};
  const sets = [];
  const vals = [];
  const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  const email = input.email ? str(input.email) : undefined;
  const username = input.username ? str(input.username) : undefined;
  if (email !== undefined || username !== undefined) await checkUnique(email, username, id);
  if (email !== undefined) add('email', email);
  if (username !== undefined) add('username', username);
  if (input.password) add('password', await bcrypt.hash(str(input.password), 10));
  if (input.image) add('image', str(input.image));
  if (input.bio) add('bio', str(input.bio));
  if (sets.length) {
    vals.push(id);
    await pool.query(`UPDATE "User" SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals)
      .catch(mapUniqueViolation);
  }
  return userJson(id);
}

// ---------- profiles ----------
async function profileOf(username, viewerId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.bio, u.image,
       EXISTS (SELECT 1 FROM "_UserFollows" f WHERE f."B" = u.id AND f."A" = $2) AS following
     FROM "User" u WHERE u.username = $1`,
    [username, viewerId || null]
  );
  if (!rows[0]) throw err(404, 'profile', 'not found');
  const { id, ...profile } = rows[0];
  return { id, profile };
}

// ---------- articles ----------
const ARTICLE_SELECT = `
  SELECT a.id, a.slug, a.title, a.description, a.body, a."createdAt", a."updatedAt", a."authorId",
    COALESCE((SELECT array_agg(t.name ORDER BY t.id) FROM "_ArticleToTag" at JOIN "Tag" t ON t.id = at."B" WHERE at."A" = a.id), '{}') AS "tagList",
    (SELECT count(*)::int FROM "_UserFavorites" f WHERE f."A" = a.id) AS "favoritesCount",
    EXISTS (SELECT 1 FROM "_UserFavorites" f WHERE f."A" = a.id AND f."B" = $1) AS favorited,
    u.username AS "authorUsername", u.bio AS "authorBio", u.image AS "authorImage",
    EXISTS (SELECT 1 FROM "_UserFollows" fo WHERE fo."B" = u.id AND fo."A" = $1) AS "authorFollowing"
  FROM "Article" a JOIN "User" u ON u.id = a."authorId"`;

function mapArticle(r) {
  return {
    slug: r.slug,
    title: r.title,
    description: r.description,
    body: r.body,
    tagList: r.tagList,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    favorited: r.favorited,
    favoritesCount: r.favoritesCount,
    author: {
      username: r.authorUsername,
      bio: r.authorBio,
      image: r.authorImage,
      following: r.authorFollowing,
    },
  };
}

function paging(q) {
  const off = Number(q.offset);
  const lim = Number(q.limit);
  return {
    offset: Number.isFinite(off) && off >= 0 ? Math.floor(off) : 0,
    limit: Number.isFinite(lim) && lim >= 0 ? Math.floor(lim) : 10,
  };
}

async function listArticles(q, viewerId) {
  const params = [viewerId || null];
  const where = [`(u.demo = true OR a."authorId" = $1)`];
  if (q.author !== undefined && q.author !== '') {
    params.push(String(q.author));
    where.push(`u.username = $${params.length}`);
  }
  if (q.tag !== undefined && q.tag !== '') {
    params.push(String(q.tag));
    where.push(`EXISTS (SELECT 1 FROM "_ArticleToTag" at JOIN "Tag" t ON t.id = at."B" WHERE at."A" = a.id AND t.name = $${params.length})`);
  }
  if (q.favorited !== undefined && q.favorited !== '') {
    params.push(String(q.favorited));
    where.push(`EXISTS (SELECT 1 FROM "_UserFavorites" f JOIN "User" fu ON fu.id = f."B" WHERE f."A" = a.id AND fu.username = $${params.length})`);
  }
  return runList(where, params, q);
}

async function feed(q, viewerId) {
  const where = [`EXISTS (SELECT 1 FROM "_UserFollows" fo WHERE fo."A" = $1 AND fo."B" = a."authorId")`];
  return runList(where, [viewerId], q);
}

async function runList(where, params, q) {
  const { offset, limit } = paging(q);
  const w = 'WHERE ' + where.join(' AND ');
  const countRes = await pool.query(
    `SELECT count(*)::int AS c FROM "Article" a JOIN "User" u ON u.id = a."authorId" ${w}`,
    params
  );
  const p = [...params, offset, limit];
  const { rows } = await pool.query(
    `${ARTICLE_SELECT} ${w} ORDER BY a."createdAt" DESC, a.id DESC OFFSET $${p.length - 1} LIMIT $${p.length}`,
    p
  );
  return { articles: rows.map(mapArticle), articlesCount: countRes.rows[0].c };
}

async function getArticle(slug, viewerId) {
  const { rows } = await pool.query(`${ARTICLE_SELECT} WHERE a.slug = $2`, [viewerId || null, slug]);
  if (!rows[0]) throw err(404, 'article', 'not found');
  return rows[0];
}

async function findArticleRow(slug) {
  const { rows } = await pool.query('SELECT id, "authorId" FROM "Article" WHERE slug = $1', [slug]);
  if (!rows[0]) throw err(404, 'article', 'not found');
  return rows[0];
}

async function setTags(client, articleId, tagList) {
  await client.query('DELETE FROM "_ArticleToTag" WHERE "A" = $1', [articleId]);
  const names = [];
  for (const t of Array.isArray(tagList) ? tagList : []) {
    const n = str(t);
    if (n && !names.includes(n)) names.push(n);
  }
  for (const name of names) {
    const r = await client.query(
      `INSERT INTO "Tag" (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [name]
    );
    await client.query(
      'INSERT INTO "_ArticleToTag" ("A", "B") VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [articleId, r.rows[0].id]
    );
  }
}

async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

const makeSlug = (title, userId) => `${slugify(title)}-${userId}`;
const SLUG_TAKEN = () => err(422, 'title', 'must be unique');

async function createArticle(input, userId) {
  input = input || {};
  const { title, description, body } = input;
  if (!title) throw err(422, 'title', "can't be blank");
  if (!description) throw err(422, 'description', "can't be blank");
  if (!body) throw err(422, 'body', "can't be blank");
  const slug = makeSlug(str(title), userId);
  const exists = await pool.query('SELECT 1 FROM "Article" WHERE slug = $1', [slug]);
  if (exists.rows.length) throw SLUG_TAKEN();
  await withTx(async (c) => {
    const r = await c.query(
      `INSERT INTO "Article" (slug, title, description, body, "authorId") VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [slug, str(title), str(description), str(body), userId]
    ).catch((e) => { if (e.code === '23505') throw SLUG_TAKEN(); throw e; });
    await setTags(c, r.rows[0].id, input.tagList);
  });
  return mapArticle(await getArticle(slug, userId));
}

async function updateArticle(slug, input, userId) {
  input = input || {};
  const art = await findArticleRow(slug);
  if (art.authorId !== userId) throw err(403, 'article', 'forbidden');
  let newSlug = slug;
  const sets = [];
  const vals = [];
  const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (input.title) {
    newSlug = makeSlug(str(input.title), userId);
    if (newSlug !== slug) {
      const ex = await pool.query('SELECT 1 FROM "Article" WHERE slug = $1', [newSlug]);
      if (ex.rows.length) throw SLUG_TAKEN();
    }
    add('title', str(input.title));
    add('slug', newSlug);
  }
  if (input.description) add('description', str(input.description));
  if (input.body) add('body', str(input.body));
  sets.push('"updatedAt" = now()');
  await withTx(async (c) => {
    vals.push(art.id);
    await c.query(`UPDATE "Article" SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals)
      .catch((e) => { if (e.code === '23505') throw SLUG_TAKEN(); throw e; });
    await setTags(c, art.id, input.tagList);
  });
  return mapArticle(await getArticle(newSlug, userId));
}

async function deleteArticle(slug, userId) {
  const art = await findArticleRow(slug);
  if (art.authorId !== userId) throw err(403, 'article', 'forbidden');
  await pool.query('DELETE FROM "Article" WHERE id = $1', [art.id]);
}

// ---------- comments ----------
const COMMENT_SELECT = `
  SELECT c.id, c."createdAt", c."updatedAt", c.body,
    u.username, u.bio, u.image,
    EXISTS (SELECT 1 FROM "_UserFollows" fo WHERE fo."B" = u.id AND fo."A" = $1) AS following
  FROM "Comment" c JOIN "User" u ON u.id = c."authorId"`;
const mapComment = (r) => ({
  id: r.id,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  body: r.body,
  author: { username: r.username, bio: r.bio, image: r.image, following: r.following },
});

async function listComments(slug, viewerId) {
  const art = await findArticleRow(slug);
  const { rows } = await pool.query(
    `${COMMENT_SELECT} WHERE c."articleId" = $2 AND (u.demo = true OR c."authorId" = $1) ORDER BY c."createdAt" ASC, c.id ASC`,
    [viewerId || null, art.id]
  );
  return rows.map(mapComment);
}

async function addComment(slug, input, userId) {
  input = input || {};
  if (!input.body) throw err(422, 'body', "can't be blank");
  const art = await findArticleRow(slug);
  const r = await pool.query(
    `INSERT INTO "Comment" (body, "articleId", "authorId") VALUES ($1, $2, $3) RETURNING id`,
    [str(input.body), art.id, userId]
  );
  const { rows } = await pool.query(`${COMMENT_SELECT} WHERE c.id = $2`, [userId, r.rows[0].id]);
  return mapComment(rows[0]);
}

async function deleteComment(slug, idParam, userId) {
  const art = await findArticleRow(slug);
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw err(404, 'comment', 'not found');
  const { rowCount } = await pool.query(
    'DELETE FROM "Comment" WHERE id = $1 AND "authorId" = $2 AND "articleId" = $3',
    [id, userId, art.id]
  );
  if (!rowCount) throw err(404, 'comment', 'not found');
}

// ---------- favorites ----------
async function favorite(slug, userId, on) {
  const art = await findArticleRow(slug);
  if (on) {
    await pool.query('INSERT INTO "_UserFavorites" ("A", "B") VALUES ($1, $2) ON CONFLICT DO NOTHING', [art.id, userId]);
  } else {
    await pool.query('DELETE FROM "_UserFavorites" WHERE "A" = $1 AND "B" = $2', [art.id, userId]);
  }
  return mapArticle(await getArticle(slug, userId));
}

// ---------- tags ----------
async function popularTags(viewerId) {
  const { rows } = await pool.query(
    `SELECT t.name FROM "Tag" t
     WHERE EXISTS (SELECT 1 FROM "_ArticleToTag" at JOIN "Article" a ON a.id = at."A" JOIN "User" u ON u.id = a."authorId"
                   WHERE at."B" = t.id AND (u.demo = true OR a."authorId" = $1))
     ORDER BY (SELECT count(*) FROM "_ArticleToTag" at2 WHERE at2."B" = t.id) DESC, t.id ASC
     LIMIT 10`,
    [viewerId || null]
  );
  return rows.map((r) => r.name);
}

// ---------- app ----------
function build() {
  const app = Fastify({ logger: false });

  // Tolerate empty or malformed-free JSON bodies (e.g. DELETE with a JSON content type).
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (!body || !body.trim()) return done(null, {});
    try {
      done(null, JSON.parse(body));
    } catch (e) {
      e.statusCode = 400;
      done(e);
    }
  });

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof HttpException) return reply.code(error.status).send(error.body);
    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ errors: { body: [error.message] } });
    }
    req.log.error(error);
    return reply.code(500).send({ errors: { server: [error.message] } });
  });
  app.setNotFoundHandler((req, reply) => reply.code(404).send({ errors: { route: ['not found'] } }));

  const body = (req, key) => (req.body && typeof req.body === 'object' ? req.body[key] : undefined);

  app.register(async (api) => {
    // auth
    api.post('/users', async (req, reply) => {
      const input = { ...(body(req, 'user') || {}), demo: false };
      const user = await register(input);
      return reply.code(201).send({ user });
    });
    api.post('/users/login', async (req) => ({ user: await login(body(req, 'user')) }));
    api.get('/user', async (req) => ({ user: await userJson(auth(req)) }));
    api.put('/user', async (req) => {
      const id = auth(req);
      return { user: await updateUser(id, body(req, 'user')) };
    });

    // profiles
    api.get('/profiles/:username', async (req) => {
      const viewer = optAuth(req);
      return { profile: (await profileOf(req.params.username, viewer)).profile };
    });
    api.post('/profiles/:username/follow', async (req) => {
      const viewer = auth(req);
      const { id } = await profileOf(req.params.username, viewer);
      await pool.query('INSERT INTO "_UserFollows" ("A", "B") VALUES ($1, $2) ON CONFLICT DO NOTHING', [viewer, id]);
      return { profile: (await profileOf(req.params.username, viewer)).profile };
    });
    api.delete('/profiles/:username/follow', async (req) => {
      const viewer = auth(req);
      const { id } = await profileOf(req.params.username, viewer);
      await pool.query('DELETE FROM "_UserFollows" WHERE "A" = $1 AND "B" = $2', [viewer, id]);
      return { profile: (await profileOf(req.params.username, viewer)).profile };
    });

    // articles
    api.get('/articles', async (req) => listArticles(req.query || {}, optAuth(req)));
    api.get('/articles/feed', async (req) => feed(req.query || {}, auth(req)));
    api.post('/articles', async (req, reply) => {
      const id = auth(req);
      const article = await createArticle(body(req, 'article'), id);
      return reply.code(201).send({ article });
    });
    api.get('/articles/:slug', async (req) => {
      const viewer = optAuth(req);
      return { article: mapArticle(await getArticle(req.params.slug, viewer)) };
    });
    api.put('/articles/:slug', async (req) => {
      const id = auth(req);
      return { article: await updateArticle(req.params.slug, body(req, 'article'), id) };
    });
    api.delete('/articles/:slug', async (req, reply) => {
      const id = auth(req);
      await deleteArticle(req.params.slug, id);
      return reply.code(204).send();
    });

    // comments
    api.get('/articles/:slug/comments', async (req) => {
      const viewer = optAuth(req);
      return { comments: await listComments(req.params.slug, viewer) };
    });
    api.post('/articles/:slug/comments', async (req) => {
      const id = auth(req);
      return { comment: await addComment(req.params.slug, body(req, 'comment'), id) };
    });
    api.delete('/articles/:slug/comments/:id', async (req) => {
      const id = auth(req);
      await deleteComment(req.params.slug, req.params.id, id);
      return {};
    });

    // favorites
    api.post('/articles/:slug/favorite', async (req) => {
      const id = auth(req);
      return { article: await favorite(req.params.slug, id, true) };
    });
    api.delete('/articles/:slug/favorite', async (req) => {
      const id = auth(req);
      return { article: await favorite(req.params.slug, id, false) };
    });

    // tags
    api.get('/tags', async (req) => ({ tags: await popularTags(optAuth(req)) }));
  }, { prefix: '/api' });

  return app;
}

async function main() {
  await pool.query(SCHEMA);
  const app = build();
  await app.listen({ port: PORT, host: HOST });
  console.log(`listening on http://${HOST}:${PORT}`);
  const stop = async () => { await app.close(); await pool.end(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
