import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/pjc_test?schema=public";
process.env.JWT_SECRET = "test-secret-with-at-least-32-characters";
process.env.SESSION_COOKIE_NAME = "pjc_test_session";
process.env.TRUST_PROXY = "false";

const [{ default: request }, { createApp }, { signAuthToken }] =
  await Promise.all([
    import("supertest"),
    import("../src/app.js"),
    import("../src/utils/jwt.js"),
  ]);

const app = createApp();

test("root redirects to the dashboard route", async () => {
  const response = await request(app).get("/");

  assert.equal(response.status, 302);
  assert.equal(response.headers.location, "/app/dashboard");
});

test("frontend deep links serve the application shell", async () => {
  const [dashboard, applicationDetail, companies] = await Promise.all([
    request(app).get("/app/dashboard"),
    request(app).get("/app/applications/42"),
    request(app).get("/app/companies"),
  ]);

  for (const response of [dashboard, applicationDetail, companies]) {
    assert.equal(response.status, 200);
    assert.match(response.headers["content-type"], /^text\/html/);
    assert.match(response.text, /PJC — Job Tracker/);
  }
});

test("health endpoint is available without the database", async () => {
  const response = await request(app).get("/health");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: "ok" });
});

test("unknown routes use the JSON error contract", async () => {
  const response = await request(app).get("/missing");

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, {
    error: {
      code: "ROUTE_NOT_FOUND",
      message: "Route not found",
    },
  });
});

test("malformed JSON does not expose a stack trace", async () => {
  const response = await request(app)
    .post("/users")
    .set("Content-Type", "application/json")
    .send("{bad json}");

  assert.equal(response.status, 400);
  assert.match(response.headers["content-type"], /^application\/json/);
  assert.equal(response.body.error.code, "MALFORMED_JSON");
  assert.equal(JSON.stringify(response.body).includes("C:\\Projects"), false);
});

test("oversized JSON uses a bounded JSON error", async () => {
  const response = await request(app)
    .post("/users")
    .send({
      email: "person@example.com",
      password: `valid-password-${"x".repeat(33 * 1024)}`,
    });

  assert.equal(response.status, 413);
  assert.equal(response.body.error.code, "PAYLOAD_TOO_LARGE");
});

test("registration validates and normalizes its public contract", async () => {
  const response = await request(app).post("/users").send({
    email: "not-an-email",
    password: "short",
    unexpected: true,
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
  assert.ok(
    response.body.error.details.some(
      (detail) => detail.field === "body.email",
    ),
  );
  assert.ok(
    response.body.error.details.some(
      (detail) => detail.field === "body.password",
    ),
  );
});

test("protected routes reject missing authentication consistently", async () => {
  const response = await request(app).get("/applications");

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    error: {
      code: "UNAUTHORIZED",
      message: "Authentication is required",
    },
  });
});

test("cookie authentication reaches request validation", async () => {
  const token = signAuthToken(1);
  const response = await request(app)
    .get("/applications/1.5")
    .set("Cookie", [`pjc_test_session=${token}`]);

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
  assert.equal(response.body.error.details[0].field, "params.id");
});

test("application creation requires exactly one company source", async () => {
  const token = signAuthToken(1);
  const response = await request(app)
    .post("/applications")
    .set("Cookie", [`pjc_test_session=${token}`])
    .send({
      title: "Product Engineer",
      companyId: 1,
      company: { name: "Duplicate choice" },
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
  assert.ok(
    response.body.error.details.some(
      (detail) => detail.field === "body.companyId",
    ),
  );
});

test("application workflow fields and archive filters are validated", async () => {
  const token = signAuthToken(1);
  const invalidWorkflow = await request(app)
    .post("/applications")
    .set("Cookie", [`pjc_test_session=${token}`])
    .send({
      title: "Product Engineer",
      company: { name: "Example" },
      contactEmail: "not-an-email",
    });
  const invalidArchiveFilter = await request(app)
    .get("/applications?archived=deleted")
    .set("Cookie", [`pjc_test_session=${token}`]);
  const invalidSort = await request(app)
    .get("/applications?sort=random")
    .set("Cookie", [`pjc_test_session=${token}`]);

  assert.equal(invalidWorkflow.status, 400);
  assert.equal(invalidWorkflow.body.error.code, "VALIDATION_ERROR");
  assert.ok(
    invalidWorkflow.body.error.details.some(
      (detail) => detail.field === "body.contactEmail",
    ),
  );
  assert.equal(invalidArchiveFilter.status, 400);
  assert.equal(invalidArchiveFilter.body.error.code, "VALIDATION_ERROR");
  assert.equal(invalidSort.status, 400);
  assert.equal(invalidSort.body.error.code, "VALIDATION_ERROR");
});

test("logout clears the hardened browser session cookie", async () => {
  const response = await request(app).post("/auth/logout");
  const cookie = response.headers["set-cookie"]?.[0] ?? "";

  assert.equal(response.status, 204);
  assert.match(cookie, /^pjc_test_session=;/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(cookie, /Path=\//i);
});

test("invalid cookie sessions are rejected and cleared", async () => {
  const response = await request(app)
    .get("/applications")
    .set("Cookie", ["pjc_test_session=invalid"]);
  const cookie = response.headers["set-cookie"]?.[0] ?? "";

  assert.equal(response.status, 401);
  assert.equal(response.body.error.message, "Invalid or expired session");
  assert.match(cookie, /^pjc_test_session=;/);
});

test("security headers are enabled and framework disclosure is disabled", async () => {
  const response = await request(app).get("/health");

  assert.equal(response.headers["x-powered-by"], undefined);
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.match(response.headers["content-security-policy"], /default-src 'self'/);
  assert.equal(response.headers["x-frame-options"], "SAMEORIGIN");
});

test("authentication endpoints publish standard rate-limit headers", async () => {
  const response = await request(app).post("/auth/login").send({
    email: "bad",
    password: "",
  });

  assert.equal(response.status, 400);
  assert.ok(response.headers["ratelimit-policy"]);
  assert.equal(response.headers["x-ratelimit-limit"], undefined);
});
