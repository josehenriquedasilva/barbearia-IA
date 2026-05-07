import { PlanType } from "@prisma/client";

export const PLAN_LIMITS = {
  [PlanType.BRONZE]: {
    maxBarbers: 2,
    maxServices: 8,
    hasIA: false,
    label: "Bronze",
  },
  [PlanType.SILVER]: {
    maxBarbers: 5,
    maxServices: 16,
    hasIA: true,
    label: "Silver",
  },
} as const;

export function canAddMore(currentCount: number, limit: number) {
  return currentCount < limit;
}