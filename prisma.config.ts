import "dotenv/config";
import { defineConfig } from "prisma/config";

const defaultLocalDatabaseUrl =
  "postgresql://postgres:postgres@localhost:5432/pjc_db?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? defaultLocalDatabaseUrl,
  },
});
