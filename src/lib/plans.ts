import { PlanType } from "@prisma/client";

export interface PlanDetail {
  name: string;
  price: number;
  maxBarbers: number;
  description: string;
  features: string[];
  popular?: boolean;
}

export const PLAN_DETAILS: Record<PlanType, PlanDetail> = {
  BRONZE: {
    name: "Plano Bronze",
    price: 50.0,
    maxBarbers: 2,
    description: "Ideal para barbearias pequenas e autônomos",
    features: [
      "Até 2 barbeiros cadastrados",
      "Suporte via e-mail",
    ],
  },
  SILVER: {
    name: "Plano Prata",
    price: 80.0,
    maxBarbers: 4,
    description: "Para barbearias em expansão",
    features: [
      "Até 5 barbeiros cadastrados",
      "Gestão completa de agendamentos",
      "Suporte prioritário via WhatsApp",
    ],
    popular: true,
  },
};