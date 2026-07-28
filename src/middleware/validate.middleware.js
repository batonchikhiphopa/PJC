function issueDetails(issues, target) {
  return issues.map((issue) => ({
    field: [target, ...issue.path].join("."),
    message: issue.message,
  }));
}

function validate(schema, target, destination) {
  return (req, res, next) => {
    const result = schema.safeParse(req[target] ?? {});

    if (!result.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: issueDetails(result.error.issues, target),
        },
      });
    }

    req[destination] = result.data;
    return next();
  };
}

export function validateBody(schema) {
  return validate(schema, "body", "validatedBody");
}

export function validateParams(schema) {
  return validate(schema, "params", "validatedParams");
}

export function validateQuery(schema) {
  return validate(schema, "query", "validatedQuery");
}
