/*
  Warnings:

  - The values [CODE] on the enum `QuestionType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the `Participant` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "QuestionType_new" AS ENUM ('MCQ', 'TEXT');
ALTER TABLE "public"."QuizQuestion" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "public"."SessionQuestion" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "QuizQuestion" ALTER COLUMN "type" TYPE "QuestionType_new" USING ("type"::text::"QuestionType_new");
ALTER TABLE "SessionQuestion" ALTER COLUMN "type" TYPE "QuestionType_new" USING ("type"::text::"QuestionType_new");
ALTER TYPE "QuestionType" RENAME TO "QuestionType_old";
ALTER TYPE "QuestionType_new" RENAME TO "QuestionType";
DROP TYPE "public"."QuestionType_old";
ALTER TABLE "QuizQuestion" ALTER COLUMN "type" SET DEFAULT 'MCQ';
ALTER TABLE "SessionQuestion" ALTER COLUMN "type" SET DEFAULT 'MCQ';
COMMIT;

-- DropForeignKey
ALTER TABLE "Participant" DROP CONSTRAINT "Participant_sessionId_fkey";

-- DropTable
DROP TABLE "Participant";

-- DropEnum
DROP TYPE "Role";
