import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SubscriptionStatus } from "@prisma/client";

// Função auxiliar para gerar a página HTML com design moderno e responsivo
function renderHtmlResponse(
  title: string,
  message: string,
  type: "success" | "error",
  shopName: string,
) {
  const isSuccess = type === "success";
  const icon = isSuccess ? "✅" : "❌";
  const accentColor = isSuccess ? "#10B981" : "#EF4444";

  return new Response(
    `<!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - BarberPro IA</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Inter', sans-serif;
          background-color: #0F172A;
          color: #F8FAFC;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 20px;
        }
        .card {
          background: #1E293B;
          border: 1px solid #334155;
          border-radius: 16px;
          padding: 40px 32px;
          max-width: 440px;
          width: 100%;
          text-align: center;
          box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.3), 0 8px 10px -6px rgb(0 0 0 / 0.3);
        }
        .icon-container {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: ${accentColor}20;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
          font-size: 32px;
          border: 2px solid ${accentColor}40;
        }
        h1 {
          font-size: 22px;
          font-weight: 700;
          color: #F8FAFC;
          margin-bottom: 12px;
        }
        p {
          font-size: 15px;
          color: #94A3B8;
          line-height: 1.6;
          margin-bottom: 24px;
        }
        .badge {
          display: inline-block;
          background: #334155;
          color: #E2E8F0;
          padding: 8px 16px;
          border-radius: 9999px;
          font-size: 14px;
          font-weight: 500;
        }
        .badge strong {
          color: #ffffff;
        }
        .footer {
          margin-top: 32px;
          font-size: 12px;
          color: #64748B;
          border-top: 1px solid #334155;
          padding-top: 16px;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon-container">${icon}</div>
        <h1>${title}</h1>
        <p>${message}</p>
        <div>
          <span class="badge">Barbearia: <strong>${shopName}</strong></span>
        </div>
        <div class="footer">
          BarberPro IA • Painel Administrativo
        </div>
      </div>
    </body>
    </html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  const paymentId = searchParams.get("paymentId");
  const secret = searchParams.get("secret");

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
    const nextExpiration = new Date();
    nextExpiration.setDate(nextExpiration.getDate() + 30);

    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "APPROVED", approvedAt: new Date() },
      }),
      prisma.shop.update({
        where: { id: payment.shopId },
        data: {
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          subscriptionEnd: nextExpiration,
          paymentClaimedAt: null,
        },
      }),
    ]);

    return renderHtmlResponse(
      "Pagamento Aprovado com Sucesso!",
      "O acesso da barbearia foi liberado com sucesso por mais 30 dias.",
      "success",
      payment.shop.name,
    );
  }

  if (action === "reject") {
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "REJECTED" },
      }),
      prisma.shop.update({
        where: { id: payment.shopId },
        data: {
          subscriptionStatus: SubscriptionStatus.EXPIRED,
        },
      }),
    ]);

    return renderHtmlResponse(
      "Pagamento Rejeitado",
      "A assinatura da barbearia foi alterada para expirada no sistema.",
      "error",
      payment.shop.name,
    );
  }

  return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });
}
