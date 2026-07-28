-- AlterTable
ALTER TABLE "Application"
ADD COLUMN "nextAction" TEXT,
ADD COLUMN "nextActionAt" TIMESTAMP(3),
ADD COLUMN "contactName" TEXT,
ADD COLUMN "contactEmail" TEXT,
ADD COLUMN "contactPhone" TEXT,
ADD COLUMN "source" TEXT,
ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ApplicationStatusHistory" (
    "id" SERIAL NOT NULL,
    "fromStatus" "ApplicationStatus",
    "toStatus" "ApplicationStatus" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "applicationId" INTEGER NOT NULL,

    CONSTRAINT "ApplicationStatusHistory_pkey" PRIMARY KEY ("id")
);

-- Backfill one initial status event for existing applications.
INSERT INTO "ApplicationStatusHistory" (
    "fromStatus",
    "toStatus",
    "changedAt",
    "userId",
    "applicationId"
)
SELECT
    NULL,
    "status",
    "createdAt",
    "userId",
    "id"
FROM "Application";

-- CreateIndex
CREATE INDEX "Application_userId_archivedAt_nextActionAt_idx"
ON "Application"("userId", "archivedAt", "nextActionAt");

-- CreateIndex
CREATE INDEX "Application_companyId_idx"
ON "Application"("companyId");

-- CreateIndex
CREATE INDEX "ApplicationStatusHistory_applicationId_changedAt_idx"
ON "ApplicationStatusHistory"("applicationId", "changedAt");

-- CreateIndex
CREATE INDEX "ApplicationStatusHistory_userId_idx"
ON "ApplicationStatusHistory"("userId");

-- AddForeignKey
ALTER TABLE "ApplicationStatusHistory"
ADD CONSTRAINT "ApplicationStatusHistory_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationStatusHistory"
ADD CONSTRAINT "ApplicationStatusHistory_applicationId_fkey"
FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
