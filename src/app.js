import express from "express";
import healthRoutes from "./routes/health.routes.js";
import userRoutes from "./routes/users.routes.js";

const app = express();

app.use(express.json());

app.use("/health", healthRoutes);
app.use("/users", userRoutes);

export default app;