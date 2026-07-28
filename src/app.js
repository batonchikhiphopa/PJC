import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { env } from "./config/env.js";
import healthRoutes from "./routes/health.routes.js";
import userRoutes from "./routes/users.routes.js";
import authRoutes from "./routes/auth.routes.js";
import companyRoutes from "./routes/companies.routes.js";
import applicationRoutes from "./routes/applications.routes.js";
import noteRoutes from "./routes/notes.routes.js";
import {
  errorMiddleware,
  notFoundMiddleware,
} from "./middleware/error.middleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDirectory = path.resolve(__dirname, "../client");
const clientIndex = path.join(clientDirectory, "index.html");

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
          ],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests:
            env.NODE_ENV === "production" ? [] : null,
        },
      },
      strictTransportSecurity:
        env.NODE_ENV === "production" ? undefined : false,
    }),
  );
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());

  app.get("/", (req, res) => {
    return res.redirect(302, "/app/dashboard");
  });

  app.use("/health", healthRoutes);
  app.use("/auth", authRoutes);
  app.use("/users", userRoutes);
  app.use("/companies", companyRoutes);
  app.use("/applications", applicationRoutes);
  app.use("/notes", noteRoutes);

  app.get("/client", (req, res) => {
    return res.redirect(302, "/app/dashboard");
  });
  app.use("/client", express.static(clientDirectory));

  app.get(
    [
      "/app",
      "/app/dashboard",
      "/app/applications",
      "/app/applications/:id",
      "/app/companies",
    ],
    (req, res) => res.sendFile(clientIndex),
  );

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}

const app = createApp();

export default app;
