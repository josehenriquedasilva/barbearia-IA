// @/lib/whatsapp.ts

// 1. Função para ENVIAR mensagens via Pilot Status
export async function sendWhatsAppMessage(
  instanceName: string,
  number: string,
  text: string,
) {
  const baseUrl =
    process.env.PILOT_STATUS_NATIVE_URL ||
    process.env.WHATSAPP_API_URL ||
    process.env.NEXT_PUBLIC_EVOLUTION_URL;

  const apiKey =
    process.env.EVOLUTION_TENANT_KEY ||
    process.env.WHATSAPP_API_KEY ||
    process.env.EVOLUTION_API_KEY;

  if (!baseUrl || !apiKey) {
    console.error(
      "[WhatsApp Error] Variáveis de ambiente (PILOT_STATUS_NATIVE_URL ou EVOLUTION_TENANT_KEY) não encontradas.",
    );
    return null;
  }

  const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const url = `${cleanBaseUrl}/message/sendText/${instanceName}`;

  const formattedNumber = number.replace(/\D/g, "");
  const finalNumber = formattedNumber.startsWith("55")
    ? formattedNumber
    : `55${formattedNumber}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey as string,
      },
      body: JSON.stringify({
        number: finalNumber,
        text: text,
        delay: 1200,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[WhatsApp Send Error - Status ${response.status}]:`,
        errorText,
      );
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("[WhatsApp Send Exception]:", error);
    return null;
  }
}

// 2. Função para CRIAR/CONFIGURAR o Webhook automaticamente
export async function setWebhookForInstance(instanceId: string) {
  const baseUrl =
    process.env.PILOT_STATUS_NATIVE_URL ||
    process.env.WHATSAPP_API_URL ||
    process.env.NEXT_PUBLIC_EVOLUTION_URL;

  const apiKey =
    process.env.EVOLUTION_TENANT_KEY ||
    process.env.WHATSAPP_API_KEY ||
    process.env.EVOLUTION_API_KEY;

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://sua-url.vercel.app";
  const webhookUrl = `${siteUrl.replace(/\/$/, "")}/api/whatsapp`;

  if (!baseUrl || !apiKey) {
    console.error(
      "[Pilot Status] Variáveis de ambiente não encontradas para o Webhook.",
    );
    return false;
  }

  const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;

  try {
    const response = await fetch(`${cleanBaseUrl}/webhooks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        url: webhookUrl,
        events: ["message.received"],
        numberId: instanceId,
      }),
    });

    if (response.ok) {
      console.log(
        `[Pilot Status] Webhook registrado com sucesso para o ID: ${instanceId}`,
      );
      return true;
    }

    // Tentativa em endpoint alternativo caso o /webhooks exija o ID na rota
    const altResponse = await fetch(
      `${cleanBaseUrl}/numbers/${instanceId}/webhooks`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          url: webhookUrl,
          events: ["message.received"],
        }),
      },
    );

    return altResponse.ok;
  } catch (error) {
    console.error("[Pilot Status] Erro ao registrar webhook:", error);
    return false;
  }
}
