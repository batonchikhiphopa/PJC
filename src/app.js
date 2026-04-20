import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import healthRoutes from "./routes/health.routes.js";
import userRoutes from "./routes/users.routes.js";
import authRoutes from "./routes/auth.routes.js";
import companyRoutes from "./routes/companies.routes.js";
import applicationRoutes from "./routes/applications.routes.js";
import noteRoutes from "./routes/notes.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());

app.use("/health", healthRoutes);
app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/companies", companyRoutes);
app.use("/applications", applicationRoutes);
app.use("/notes", noteRoutes);

app.use("/client", express.static(path.resolve(__dirname, "../client")));

app.use((req, res) => {
  return res.status(404).json({
    error: "Route not found",
  });
});

export default app;