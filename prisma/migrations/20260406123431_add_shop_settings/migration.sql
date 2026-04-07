-- AlterTable
ALTER TABLE "shops" ADD COLUMN     "closing_sunday" TEXT,
ADD COLUMN     "closing_time" TEXT NOT NULL DEFAULT '19:00',
ADD COLUMN     "day_off" TEXT,
ADD COLUMN     "has_day_off" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "has_lunch_break" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_closed_sunday" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lunch_end" TEXT,
ADD COLUMN     "lunch_start" TEXT,
ADD COLUMN     "opening_sunday" TEXT,
ADD COLUMN     "opening_time" TEXT NOT NULL DEFAULT '09:00';
