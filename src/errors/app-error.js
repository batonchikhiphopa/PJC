export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message, details) {
  return new AppError(400, "BAD_REQUEST", message, details);
}

export function unauthorized(message = "Authentication is required") {
  return new AppError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "Forbidden") {
  return new AppError(403, "FORBIDDEN", message);
}

export function notFound(message = "Resource not found") {
  return new AppError(404, "NOT_FOUND", message);
}

export function conflict(message) {
  return new AppError(409, "CONFLICT", message);
}
