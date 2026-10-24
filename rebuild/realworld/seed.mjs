// The conformance seed for RealWorld: two users and a record of the owner's, made through the
// API itself, so it works the same against the original and any rebuild.
const base = process.env.VERIDIC_CONFORM_URL;
const run = Date.now().toString(36);
const call = async (method, path, body, token) => {
  const res = await fetch(new URL(path, base), { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Token ${token}` } : {}) }, body: body && JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
};
const register = (name) => call("POST", "/api/users", { user: { email: `${name}-${run}@example.test`, username: `${name}-${run}`, password: `pw-${name}-${run}` } }).then((r) => r.user);
const owner = await register("owner"), other = await register("other");
const { article } = await call("POST", "/api/articles", { article: { title: `Seeded ${run}`, description: "d", body: "b", tagList: ["conform"] } }, owner.token);
const { comment } = await call("POST", `/api/articles/${article.slug}/comments`, { comment: { body: "First" } }, owner.token);
console.log(JSON.stringify({
  users: { owner: { headers: { authorization: `Token ${owner.token}` } }, other: { headers: { authorization: `Token ${other.token}` } } },
  seeds: { slug: article.slug, id: comment.id, title: article.title, username: owner.username, email: owner.email, password: `pw-owner-${run}`, other_username: other.username },
}));
