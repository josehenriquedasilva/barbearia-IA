/*
  Warnings:

  - The values [PENDING,CANCELED_IMPREVISTO] on the enum `AppointmentStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('BRONZE', 'SILVER');

-- AlterEnum
BEGIN;
CREATE TYPE "AppointmentStatus_new" AS ENUM ('CONFIRMED', 'CANCELED');
ALTER TABLE "public"."appointments" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "appointments" ALTER COLUMN "status" TYPE "AppointmentStatus_new" USING ("status"::text::"AppointmentStatus_new");
ALTER TYPE "AppointmentStatus" RENAME TO "AppointmentStatus_old";
ALTER TYPE "AppointmentStatus_new" RENAME TO "AppointmentStatus";
DROP TYPE "public"."AppointmentStatus_old";
ALTER TABLE "appointments" ALTER COLUMN "status" SET DEFAULT 'CONFIRMED';
COMMIT;

-- AlterTable
ALTER TABLE "shops" ADD COLUMN     "closedDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "plan" "PlanType" NOT NULL DEFAULT 'BRONZE';
