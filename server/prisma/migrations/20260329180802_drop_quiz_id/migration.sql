/*
  Warnings:

  - You are about to drop the column `quizId` on the `Session` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_quizId_fkey";

-- AlterTable
ALTER TABLE "Session" DROP COLUMN "quizId",
ADD COLUMN     "lastQuizTitle" TEXT;
