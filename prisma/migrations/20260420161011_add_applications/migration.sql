-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('wishlist', 'applied', 'interview', 'test_task', 'offer', 'rejected', 'ghosted');

-- CreateTable
CREATE TABLE "Application" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'wishlist',
    "jobUrl" TEXT,
    "salary" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
