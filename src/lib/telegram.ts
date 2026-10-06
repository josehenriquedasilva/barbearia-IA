const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Envia mensagem no Telegram com botões de ação para aprovar/rejeitar pagamento
 */
export async function sendPaymentNotification({
  paymentId,
  shopName,
  planName,
  amount,
  phone,
}: {
  paymentId: number;
  shopName: string;
  planName: string;
  amount: number;
  phone: string;
}) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("⚠️ Telegram Bot não configurado no .env");
    return;
  }

  const message =
    `🚨 *NOVO PAGAMENTO INFORMADO!* 🚨\n\n` +
    `🏪 *Barbearia:* ${shopName}\n` +
    `📞 *Telefone:* ${phone}\n` +
    `📦 *Plano:* ${planName}\n` +
    `💰 *Valor:* R$ ${amount.toFixed(2)}\n\n` +
    ` Confira no app do seu banco se o Pix no valor de *R$ ${amount.toFixed(2)}* realmente caiu e escolha uma das opções abaixo:`;

  // URL do seu site para processar a aprovação (pode ser um Webhook/Route handler)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "✅ Aprovar Pagamento",
            url: `${appUrl}/api/admin/payment?action=approve&paymentId=${paymentId}&secret=${TELEGRAM_BOT_TOKEN}`,
          },
          {
            text: "❌ Rejeitar Pagamento",
            url: `${appUrl}/api/admin/payment?action=reject&paymentId=${paymentId}&secret=${TELEGRAM_BOT_TOKEN}`,
          },
        ],
      ],
    },
  };

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    const data = await response.json();
    console.log("Response do Telegram:", data);
  } catch (error) {
    console.error("Erro ao enviar notificação no Telegram:", error);
  }
}
