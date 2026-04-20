# PJC Job Tracker API

PJC is a small Express API for tracking job applications, companies, and notes. It is built as a clean MVP backend for a portfolio-ready job search tracker.

## Stack

- Node.js with ESM
- Express
- PostgreSQL
- Prisma 7.7 with `@prisma/adapter-pg`
- Docker Compose
- JWT authentication
- `tsx` runtime

## MVP Features

- User registration and login
- JWT-protected routes
- Owner-based access checks
- Companies CRUD
- Applications CRUD with status and company filters
- Applications dashboard with status, company, and recent activity summaries
- Notes CRUD
- Basic request validation
- Health checks
- JSON 404 responses

## Setup

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Update `.env` if needed:

```env
PORT=5000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pjc_db?schema=public"
JWT_SECRET="change-this-secret"
```

## Database

Start PostgreSQL with Docker Compose:

```bash
npm run db:up
```

Apply Prisma migrations:

```bash
npm run prisma:migrate
```

Generate the Prisma client:

```bash
npm run prisma:generate
```

## Run

Start the development server:

```bash
npm run dev
```

Start the server without watch mode:

```bash
npm start
```

By default, the API runs on `http://localhost:5000`.

## Endpoints

Most endpoints require `Authorization: Bearer <token>` after login.

### Health

- `GET /health`
- `GET /health/db`

### Auth

- `POST /auth/login`
- `GET /auth/me`

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
- `GET /applications/:id`
- `PATCH /applications/:id`
- `DELETE /applications/:id`

### Notes

- `POST /notes`
- `GET /notes`
- `GET /notes?applicationId=1`
- `GET /notes/:id`
- `PATCH /notes/:id`
- `DELETE /notes/:id`
