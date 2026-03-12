/*
  Warnings:

  - You are about to drop the column `closedDays` on the `shops` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "cancel_reason" VARCHAR(255);

-- AlterTable
ALTER TABLE "shops" DROP COLUMN "closedDays";

-- CreateTable
CREATE TABLE "closed_days" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL,
    "reason" VARCHAR(255),
    "shop_id" INTEGER NOT NULL,

    CONSTRAINT "closed_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "closed_days_shop_id_date_key" ON "closed_days"("shop_id", "date");

-- AddForeignKey
ALTER TABLE "closed_days" ADD CONSTRAINT "closed_days_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
