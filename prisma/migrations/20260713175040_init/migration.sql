-- CreateEnum
CREATE TYPE "ReviewType" AS ENUM ('WEBSITE', 'GITHUB', 'ZIP', 'PRIVATE_WEBSITE');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "review_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" "ReviewType" NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "target" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_results" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "verdict" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_sessions_status_idx" ON "review_sessions"("status");

-- CreateIndex
CREATE INDEX "review_sessions_type_idx" ON "review_sessions"("type");

-- CreateIndex
CREATE INDEX "review_sessions_createdAt_idx" ON "review_sessions"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "review_results_sessionId_key" ON "review_results"("sessionId");

-- CreateIndex
CREATE INDEX "review_results_createdAt_idx" ON "review_results"("createdAt");

-- AddForeignKey
ALTER TABLE "review_results" ADD CONSTRAINT "review_results_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "review_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

