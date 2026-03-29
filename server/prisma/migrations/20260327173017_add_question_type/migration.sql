-- AlterTable
ALTER TABLE "QuizQuestion" ADD COLUMN     "type" "QuestionType" NOT NULL DEFAULT 'MCQ';

-- AlterTable
ALTER TABLE "SessionQuestion" ADD COLUMN     "type" "QuestionType" NOT NULL DEFAULT 'MCQ';
