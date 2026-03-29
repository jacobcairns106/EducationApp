-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "lecturerId" TEXT;

-- CreateTable
CREATE TABLE "Lecturer" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lecturer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lecturer_username_key" ON "Lecturer"("username");

-- CreateIndex
CREATE INDEX "Quiz_lecturerId_idx" ON "Quiz"("lecturerId");

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_lecturerId_fkey" FOREIGN KEY ("lecturerId") REFERENCES "Lecturer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
