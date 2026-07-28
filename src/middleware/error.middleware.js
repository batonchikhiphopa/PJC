import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";

function validationDetails(error) {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "request",
    message: issue.message,
  }));
}

function normalizeError(error) {
  if (
    error instanceof SyntaxError &&
    error.status === 400 &&
    "body" in error
  ) {
    return new AppError(
      400,
      "MALFORMED_JSON",
      "Request body contains invalid JSON",
    );
  }

  if (error?.type === "entity.too.large") {
    return new AppError(
      413,
      "PAYLOAD_TOO_LARGE",
      "Request body is too large",
    );
  }

  if (error?.name === "ZodError" && Array.isArray(error.issues)) {
    return new AppError(
      400,
      "VALIDATION_ERROR",
      "Request validation failed",
      validationDetails(error),
    );
  }

  if (error?.code === "P2002") {
    const fields = Array.isArray(error.meta?.target)
      ? error.meta.target
      : [error.meta?.target].filter(Boolean);
    const isEmailConflict =
      error.meta?.modelName === "User" && fields.includes("email");

    return new AppError(
      409,
      "CONFLICT",
      isEmailConflict
        ? "An account with this email already exists"
        : "A resource with these values already exists",
    );
  }

  if (error?.code === "P2025") {
    return new AppError(404, "NOT_FOUND", "Resource not found");
  }

  return error;
}

export function notFoundMiddleware(req, res) {
  return res.status(404).json({
    error: {
      code: "ROUTE_NOT_FOUND",
      message: "Route not found",
    },
  });
}

export function errorMiddleware(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const normalized = normalizeError(error);
  const isOperational = normalized instanceof AppError;
  const status = isOperational ? normalized.status : 500;
  const code = isOperational ? normalized.code : "INTERNAL_SERVER_ERROR";
  const message = isOperational
    ? normalized.message
    : "An unexpected error occurred";

  if (status >= 500 && env.NODE_ENV !== "test") {
    console.error(`[${req.method} ${req.originalUrl}]`, error);
  }

  const body = {
    error: {
      code,
      message,
    },
  };

  if (isOperational && normalized.details) {
    body.error.details = normalized.details;
  }

  return res.status(status).json(body);
}
