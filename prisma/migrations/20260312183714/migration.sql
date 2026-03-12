/*
  Warnings:

  - A unique constraint covering the columns `[whatsappInstance]` on the table `shops` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "shops" ADD COLUMN     "whatsappInstance" TEXT,
ADD COLUMN     "whatsappToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "shops_whatsappInstance_key" ON "shops"("whatsappInstance");
