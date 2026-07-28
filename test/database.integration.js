import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/pjc_db?schema=public";
process.env.JWT_SECRET ??= "test-secret-with-at-least-32-characters";
process.env.SESSION_COOKIE_NAME = "pjc_integration_session";
process.env.TRUST_PROXY = "false";

const [{ default: request }, { createApp }, { default: prisma }] =
  await Promise.all([
    import("supertest"),
    import("../src/app.js"),
    import("../src/lib/prisma.js"),
  ]);

const app = createApp();

test("database-backed job application workflow", async () => {
  const email = `integration-${Date.now()}@example.com`;
  const password = "integration-password";
  const client = request.agent(app);

  try {
    const health = await client.get("/health/db");
    assert.equal(health.status, 200);
    assert.equal(health.body.database, "connected");

    const registration = await client.post("/users").send({ email, password });
    assert.equal(registration.status, 201);
    assert.equal(registration.body.email, email);

    const login = await client.post("/auth/login").send({ email, password });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.email, email);

    const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const creation = await client.post("/applications").send({
      title: "Integration Product Engineer",
      company: {
        name: "Integration Company",
        website: "https://example.com",
        location: "Berlin",
      },
      status: "applied",
      jobUrl: "https://example.com/jobs/1",
      salary: "€80k",
      appliedAt: new Date().toISOString(),
      nextAction: "Send portfolio",
      nextActionAt: deadline,
      contactName: "Alex Recruiter",
      contactEmail: "alex@example.com",
      contactPhone: "+49 123 456",
      source: "Referral",
    });

    assert.equal(creation.status, 201);
    assert.equal(creation.body.company.name, "Integration Company");
    assert.equal(creation.body.nextAction, "Send portfolio");
    const applicationId = creation.body.id;
    const companyId = creation.body.company.id;

    const protectedCompanyDelete = await client.delete(
      `/companies/${companyId}`,
    );
    assert.equal(protectedCompanyDelete.status, 409);

    const dashboard = await client.get("/applications/dashboard");
    assert.equal(dashboard.status, 200);
    assert.ok(
      dashboard.body.nextActions.some(
        (application) => application.id === applicationId,
      ),
    );

    const search = await client.get(
      "/applications?search=integration&sort=company_asc",
    );
    assert.equal(search.status, 200);
    assert.ok(
      search.body.some((application) => application.id === applicationId),
    );

    const update = await client.patch(`/applications/${applicationId}`).send({
      status: "interview",
      nextAction: "Prepare interview examples",
    });
    assert.equal(update.status, 200);
    assert.equal(update.body.status, "interview");

    const detail = await client.get(`/applications/${applicationId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.statusHistory.length, 2);
    assert.equal(detail.body.statusHistory[0].fromStatus, "applied");
    assert.equal(detail.body.statusHistory[0].toStatus, "interview");

    const note = await client.post("/notes").send({
      applicationId,
      content: "Discussed the next interview round.",
    });
    assert.equal(note.status, 201);

    const archive = await client.post(`/applications/${applicationId}/archive`);
    assert.equal(archive.status, 200);
    assert.ok(archive.body.archivedAt);

    const activeList = await client.get("/applications?archived=active");
    assert.equal(activeList.status, 200);
    assert.equal(
      activeList.body.some((application) => application.id === applicationId),
      false,
    );

    const archivedList = await client.get("/applications?archived=archived");
    assert.equal(archivedList.status, 200);
    assert.ok(
      archivedList.body.some(
        (application) => application.id === applicationId,
      ),
    );

    const restore = await client.post(`/applications/${applicationId}/restore`);
    assert.equal(restore.status, 200);
    assert.equal(restore.body.archivedAt, null);
  } finally {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  }
});
