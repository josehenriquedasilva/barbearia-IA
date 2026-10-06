import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SubscriptionStatus } from "@prisma/client";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  const paymentId = searchParams.get("paymentId");
  const secret = searchParams.get("secret");

  // Validação de segurança básica com o token do .env
  if (secret !== process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json(
      { error: "Acesso não autorizado" },
      { status: 401 },
    );
  }

  if (!paymentId || !action) {
    return NextResponse.json(
      { error: "Parâmetros inválidos" },
      { status: 400 },
    );
  }

  const payment = await prisma.payment.findUnique({
    where: { id: Number(paymentId) },
    include: { shop: true },
  });

  if (!payment) {
    return NextResponse.json(
      { error: "Pagamento não encontrado" },
      { status: 404 },
    );
  }

  if (action === "approve") {
    // Calcula 30 dias de acesso
    const nextExpiration = new Date();
    nextExpiration.setDate(nextExpiration.getDate() + 30);

    await prisma.$transaction([
      // 1. Marca pagamento como aprovado
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "APPROVED", approvedAt: new Date() },
      }),
      // 2. Ativa a loja e estende o acesso por 30 dias
      prisma.shop.update({
        where: { id: payment.shopId },
        data: {
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          subscriptionEnd: nextExpiration,
          paymentClaimedAt: null,
        },
      }),
    ]);

    return new Response(
      `<html><body style="font-family:sans-serif;text-align:center;padding:50px;">
        <h1 style="color:green;">✅ Pagamento Aprovado com Sucesso!</h1>
        <p>A barbearia <strong>${payment.shop.name}</strong> teve o acesso liberado por mais 30 dias.</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } },
    );
  }

  if (action === "reject") {
    await prisma.$transaction([
      // 1. Marca pagamento como rejeitado
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "REJECTED" },
      }),
      // 2. Vence a assinatura da loja
      prisma.shop.update({
        where: { id: payment.shopId },
        data: {
          subscriptionStatus: SubscriptionStatus.EXPIRED,
        },
      }),
    ]);

    return new Response(
      `<html><body style="font-family:sans-serif;text-align:center;padding:50px;">
        <h1 style="color:red;">❌ Pagamento Rejeitado!</h1>
        <p>A assinatura da barbearia <strong>${payment.shop.name}</strong> foi alterada para expirada.</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } },
    );
  }

  return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });
}
