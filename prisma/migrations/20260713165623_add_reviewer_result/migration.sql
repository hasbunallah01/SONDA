-- CreateEnum
CREATE TYPE "ReviewerType" AS ENUM ('QA', 'UX', 'MARKETING', 'INVESTOR', 'JUDGE', 'FIRST_USER');

-- CreateEnum
CREATE TYPE "PriorityFixEffort" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "PriorityFixImpact" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "reviewer_results" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "reviewer" "ReviewerType" NOT NULL,
    "score" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "summary" TEXT NOT NULL,
    "strengths" TEXT[],
    "weaknesses" TEXT[],
    "priorityFixes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviewer_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reviewer_results_sessionId_idx" ON "reviewer_results"("sessionId");

-- CreateIndex
CREATE INDEX "reviewer_results_reviewer_idx" ON "reviewer_results"("reviewer");

-- CreateIndex
CREATE INDEX "reviewer_results_createdAt_idx" ON "reviewer_results"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "reviewer_results_sessionId_reviewer_key" ON "reviewer_results"("sessionId", "reviewer");

-- AddForeignKey
ALTER TABLE "reviewer_results" ADD CONSTRAINT "reviewer_results_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "review_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
