import { z } from "zod";

export const applicationStatuses = [
  "wishlist",
  "applied",
  "interview",
  "test_task",
  "offer",
  "rejected",
  "ghosted",
];

const applicationStatusSchema = z.enum(applicationStatuses);

const positiveIdSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "Must be a positive integer")
  .transform(Number)
  .refine(Number.isSafeInteger, "Must be a safe positive integer");

const positiveNumericIdSchema = z
  .number()
  .int("Must be an integer")
  .positive("Must be a positive integer")
  .max(Number.MAX_SAFE_INTEGER, "Must be a safe positive integer");

const requiredText = (field, maxLength) =>
  z
    .string()
    .trim()
    .min(1, `${field} is required`)
    .max(maxLength, `${field} must contain at most ${maxLength} characters`);

const nullableText = (field, maxLength) =>
  z
    .union([
      z
        .string()
        .trim()
        .max(
          maxLength,
          `${field} must contain at most ${maxLength} characters`,
        ),
      z.null(),
    ])
    .transform((value) => (value === "" ? null : value));

const httpUrl = (field) =>
  z
    .string()
    .trim()
    .max(2048, `${field} must contain at most 2048 characters`)
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    }, `${field} must be a valid http:// or https:// URL`);

const nullableHttpUrl = (field) =>
  z
    .union([httpUrl(field), z.literal(""), z.null()])
    .transform((value) => (value === "" ? null : value));

const nullableEmail = z
  .union([
    z.string().trim().pipe(z.email("Contact email must be valid")),
    z.literal(""),
    z.null(),
  ])
  .transform((value) => (value === "" ? null : value));

const nullableDate = z
  .union([
    z.iso.datetime({ offset: true }),
    z.literal(""),
    z.null(),
  ])
  .transform((value) =>
    value === "" || value === null ? null : new Date(value),
  );

const loginPasswordSchema = z
  .string()
  .min(1, "Password is required")
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Password must not exceed 72 UTF-8 bytes",
  );

const registrationPasswordSchema = loginPasswordSchema.min(
  8,
  "Password must contain at least 8 characters",
);

const emailSchema = z
  .string()
  .trim()
  .pipe(z.email("Email must be valid"))
  .transform((value) => value.toLowerCase());

export const idParamsSchema = z.strictObject({
  id: positiveIdSchema,
});

export const createUserSchema = z.strictObject({
  email: emailSchema,
  password: registrationPasswordSchema,
});

export const loginSchema = z.strictObject({
  email: emailSchema,
  password: loginPasswordSchema,
});

export const createCompanySchema = z.strictObject({
  name: requiredText("Company name", 200),
  website: nullableHttpUrl("Website").optional(),
  location: nullableText("Location", 200).optional(),
});

export const updateCompanySchema = z
  .strictObject({
    name: requiredText("Company name", 200).optional(),
    website: nullableHttpUrl("Website").optional(),
    location: nullableText("Location", 200).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

const applicationWorkflowFields = {
  nextAction: nullableText("Next action", 500).optional(),
  nextActionAt: nullableDate.optional(),
  contactName: nullableText("Contact name", 200).optional(),
  contactEmail: nullableEmail.optional(),
  contactPhone: nullableText("Contact phone", 100).optional(),
  source: nullableText("Source", 200).optional(),
};

export const createApplicationSchema = z.strictObject({
  title: requiredText("Title", 200),
  companyId: positiveNumericIdSchema.optional(),
  company: createCompanySchema.optional(),
  status: applicationStatusSchema.default("wishlist"),
  jobUrl: nullableHttpUrl("Job URL").optional(),
  salary: nullableText("Salary", 100).optional(),
  appliedAt: nullableDate.optional(),
  ...applicationWorkflowFields,
}).refine(
  (value) => Number(Boolean(value.companyId)) + Number(Boolean(value.company)) === 1,
  {
    message: "Choose an existing company or provide a new company",
    path: ["companyId"],
  },
);

export const updateApplicationSchema = z
  .strictObject({
    title: requiredText("Title", 200).optional(),
    status: applicationStatusSchema.optional(),
    jobUrl: nullableHttpUrl("Job URL").optional(),
    salary: nullableText("Salary", 100).optional(),
    appliedAt: nullableDate.optional(),
    ...applicationWorkflowFields,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const applicationQuerySchema = z.strictObject({
  status: applicationStatusSchema.optional(),
  companyId: positiveIdSchema.optional(),
  archived: z.enum(["active", "archived", "all"]).default("active"),
  search: z.string().trim().max(100).optional(),
  sort: z
    .enum([
      "updated_desc",
      "updated_asc",
      "deadline_asc",
      "created_desc",
      "company_asc",
    ])
    .default("updated_desc"),
});

export const createNoteSchema = z.strictObject({
  content: requiredText("Content", 5000),
  applicationId: positiveNumericIdSchema,
});

export const updateNoteSchema = z.strictObject({
  content: requiredText("Content", 5000),
});

export const noteQuerySchema = z.strictObject({
  applicationId: positiveIdSchema.optional(),
});
