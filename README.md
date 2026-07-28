# PJC Job Tracker

PJC is a job-search workflow tracker with an Express API, a static browser
frontend, PostgreSQL, Prisma, and cookie-based JWT sessions. Applications keep
the next action, deadline, contact, source, status history, notes, and archive
state in one place.

## Requirements

- Node.js `^20.19.0`, `^22.13.0`, or `>=24`
- Docker Desktop, or another PostgreSQL server

## Local setup

### One-click Windows launch

Double-click `start-pjc.bat` in the project folder. It checks Node.js and
Docker, creates a local `.env` when needed, starts PostgreSQL, installs missing
packages, applies migrations, starts the application server in the launcher
window, and opens the application in the default browser.

Close the `PJC Server` window to stop the application server. The
PostgreSQL Docker container remains available for the next launch.

For diagnostics without starting the application:

```powershell
.\start-pjc.bat --check
```

### Manual launch

Create the local environment file:

```powershell
Copy-Item .env.example .env
```

Replace `JWT_SECRET` with a random value containing at least 32 characters.

Install dependencies. Prisma Client is generated automatically:

```powershell
npm install
```

Start PostgreSQL and apply development migrations:

```powershell
npm run db:up
npm run prisma:migrate:dev
```

Start the development server:

```powershell
npm run dev
```

Open `http://localhost:5000/`. The root URL redirects to the frontend at
`/app/dashboard`.

## Environment

```env
NODE_ENV=development
PORT=5000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pjc_db?schema=public"
JWT_SECRET="replace-with-at-least-32-random-characters"
SESSION_COOKIE_NAME="pjc_session"
TRUST_PROXY=false
```

The server validates its environment before listening. In production, set
`NODE_ENV=production`, provide a production database URL and secret, and enable
`TRUST_PROXY` only when the application is behind a trusted reverse proxy.

## Quality checks

```powershell
npm run lint
npm test
npm run check
npm run test:integration
```

The default API tests do not require a running database. They cover routing, security
headers, authentication boundaries, request validation, malformed JSON, body
size limits, and the public error contract. `test:integration` requires the
Docker database and verifies the complete registration, sign-in, application,
company, dashboard, note, status-history, archive, and restore workflow.

## Database commands

```powershell
npm run prisma:generate
npm run prisma:migrate:dev
npm run prisma:migrate
npm run prisma:status
npm run prisma:studio
```

`prisma:migrate:dev` creates and applies local development migrations.
`prisma:migrate` uses `prisma migrate deploy` and is intended for deployment.

## Authentication

Sign-in sets a seven-day JWT session in an HttpOnly, SameSite=Strict cookie.
The browser frontend does not store the token in `localStorage`. Protected API
routes also accept `Authorization: Bearer <token>` for compatible API clients.

- `POST /users`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

Repeated registration and sign-in attempts are rate limited.

## API

Most endpoints require authentication.

### Health

- `GET /health`
- `GET /health/db`

### Users

- `POST /users`
- `GET /users/:id`

### Companies

- `POST /companies`
- `GET /companies`
- `GET /companies/:id`
- `PATCH /companies/:id`
- `DELETE /companies/:id`

### Applications

- `POST /applications`
- `GET /applications`
- `GET /applications/dashboard`
- `GET /applications?status=applied`
- `GET /applications?companyId=1`
- `GET /applications?archived=active|archived|all`
- `GET /applications?search=engineer`
- `GET /applications?sort=updated_desc|updated_asc|deadline_asc|created_desc|company_asc`
- `GET /applications/:id`
- `PATCH /applications/:id`
- `POST /applications/:id/archive`
- `POST /applications/:id/restore`
- `DELETE /applications/:id`

`POST /applications` accepts either an existing `companyId` or a nested
`company` object. Nested company and application creation run in one database
transaction. Changing an application's status automatically records an
immutable status-history entry.

The dashboard returns active status counts, recent applications, and a
deadline-ordered `nextActions` queue. Archived applications are excluded from
the dashboard and active list but remain available for restoration.

## Browser routes and interaction

- `/app/dashboard`
- `/app/applications`
- `/app/applications/:id`
- `/app/companies`

These routes can be bookmarked or opened directly. Application filters are
stored in the query string, so search and sorting views can also be shared or
restored through browser navigation.

Application cards support keyboard navigation and expose a quick status
control. Forms use field-level validation, modal dialogs trap focus and close
with Escape, and completed background actions use non-blocking toast
notifications. Destructive application deletion uses an explicit confirmation;
archiving remains the normal reversible action. A company cannot be deleted
while it still owns applications.

### Notes

- `POST /notes`
- `GET /notes`
- `GET /notes?applicationId=1`
- `GET /notes/:id`
- `PATCH /notes/:id`
- `DELETE /notes/:id`

Errors use one JSON shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "body.email",
        "message": "Email must be valid"
      }
    ]
  }
}
```
