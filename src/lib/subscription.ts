"use server";

import prisma from "@/lib/db";
import { PlanType, SubscriptionStatus } from "@prisma/client";
import { sendPaymentNotification } from "@/lib/telegram";
import { PLAN_DETAILS } from "./plans";

/**
 * 1. Função para verificar se a loja tem acesso ativo ou está na tolerância de 48h
 */
export async function getShopSubscriptionStatus(shopId: number) {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      subscriptionStatus: true,
      subscriptionEnd: true,
      paymentClaimedAt: true,
      plan: true,
    },
  });

  if (!shop) {
    return { hasAccess: false, status: SubscriptionStatus.EXPIRED, shop: null };
  }

  const now = new Date();

  // Caso 1: Status ACTIVE e dentro da validade
  if (
    shop.subscriptionStatus === SubscriptionStatus.ACTIVE &&
    shop.subscriptionEnd &&
    now <= shop.subscriptionEnd
  ) {
    return { hasAccess: true, status: SubscriptionStatus.ACTIVE, shop };
  }

  // Caso 2: Em período de teste (TRIAL)
  if (
    shop.subscriptionStatus === SubscriptionStatus.TRIAL &&
    shop.subscriptionEnd &&
    now <= shop.subscriptionEnd
  ) {
    return { hasAccess: true, status: SubscriptionStatus.TRIAL, shop };
  }

  // Caso 3: PENDING_APPROVAL dentro das 48h de tolerância
  if (
    shop.subscriptionStatus === SubscriptionStatus.PENDING_APPROVAL &&
    shop.paymentClaimedAt
  ) {
    const GRACE_PERIOD_HOURS = 48;
    const graceLimit = new Date(
      shop.paymentClaimedAt.getTime() + GRACE_PERIOD_HOURS * 60 * 60 * 1000,
    );

    if (now <= graceLimit) {
      return {
        hasAccess: true,
        status: SubscriptionStatus.PENDING_APPROVAL,
        shop,
      };
    }
  }

  // Se passou de tudo, o acesso é negado
  return { hasAccess: false, status: SubscriptionStatus.EXPIRED, shop };
}

/**
 * 2. Server Action acionada quando o barbeiro clica em "Já paguei"
 */
export async function claimPaymentAction(shopId: number, planType: PlanType) {
  try {
    const planInfo = PLAN_DETAILS[planType];
    const now = new Date();

    // Busca dados da barbearia para incluir na notificação
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: { name: true, phone: true },
    });

    if (!shop) throw new Error("Barbearia não encontrada.");

    // 1. Cria o registro do pagamento pendente
    const payment = await prisma.payment.create({
      data: {
        shopId,
        plan: planType,
        amount: planInfo.price,
        status: "PENDING",
        claimedAt: now,
      },
    });

    // 2. Atualiza a loja para PENDING_APPROVAL
    await prisma.shop.update({
      where: { id: shopId },
      data: {
        subscriptionStatus: SubscriptionStatus.PENDING_APPROVAL,
        paymentClaimedAt: now,
        plan: planType,
      },
    });

    // 3. Envia a notificação instantânea para o seu Telegram!
    await sendPaymentNotification({
      paymentId: payment.id,
      shopName: shop.name,
      planName: planInfo.name,
      amount: planInfo.price,
      phone: shop.phone,
    });

    return { success: true, paymentId: payment.id };
  } catch (error) {
    console.error("Erro ao registrar intenção de pagamento:", error);
    return { success: false, error: "Falha ao registrar pagamento." };
  }
}
