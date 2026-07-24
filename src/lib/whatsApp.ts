// @/lib/whatsapp.ts

export async function sendWhatsAppMessage(
  instanceName: string,
  number: string,
  text: string,
) {
  const rawBaseUrl =
    process.env.PILOT_STATUS_NATIVE_URL ||
    process.env.WHATSAPP_API_URL ||
    "https://pilotstatus.com.br";

  const apiKey =
    process.env.EVOLUTION_TENANT_KEY ||
    process.env.WHATSAPP_API_KEY ||
    process.env.EVOLUTION_API_KEY;

  if (!rawBaseUrl || !apiKey) {
    console.error(
      "[WhatsApp Error] Variáveis de ambiente (PILOT_STATUS_NATIVE_URL ou EVOLUTION_TENANT_KEY) não encontradas.",
    );
    return null;
  }

  let baseUrl = rawBaseUrl.replace(/\/$/, "");
  if (!baseUrl.endsWith("/v1")) {
    baseUrl = `${baseUrl}/v1`;
  }

  const url = `${baseUrl}/messages/send`;

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
        whatsappNumberId: instanceName,
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

export async function setWebhookForInstance(numberId: string) {
  const tenantKey =
    process.env.EVOLUTION_TENANT_KEY ||
    process.env.PILOT_STATUS_API_KEY ||
    process.env.WHATSAPP_API_KEY;

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://barbearia-ia.vercel.app";
  const webhookUrl = `${siteUrl.replace(/\/$/, "")}/api/whatsapp`;

  let rawBaseUrl =
    process.env.PILOT_STATUS_NATIVE_URL || "https://pilotstatus.com.br";
  let baseUrl = rawBaseUrl.replace(/\/$/, "");
  if (!baseUrl.endsWith("/v1")) {
    baseUrl = `${baseUrl}/v1`;
  }

  if (!tenantKey || !numberId) {
    console.error(
      "[Pilot Status Error] Chave Tenant ou numberId ausentes para registrar o Webhook.",
    );
    return false;
  }

  try {
    console.log(
      `[Pilot Status] Tentando criar Webhook para ${numberId} com a chave TENANT...`,
    );

    // Tentativa 1: Passando o whatsappNumberId no corpo
    let response = await fetch(`${baseUrl}/webhooks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": tenantKey,
      },
      body: JSON.stringify({
        url: webhookUrl,
        name: `Barbearia IA - ${numberId}`,
        events: ["message.received", "number.connected"],
        whatsappNumberId: numberId,
      }),
    });

    let data = await response.json();

    // Se der 404 (número não encontrado por esse ID específico), tenta sem filtrar por whatsappNumberId (Webhook global da Tenant)
    if (response.status === 404) {
      console.warn(
        `[Pilot Status Warn] ID ${numberId} não encontrado no filtro de webhooks. Tentando registro global de Webhook...`,
      );

      response = await fetch(`${baseUrl}/webhooks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": tenantKey,
        },
        body: JSON.stringify({
          url: webhookUrl,
          name: `Barbearia IA Global`,
          events: ["message.received", "number.connected"],
        }),
      });

      data = await response.json();
    }

    console.log("[DEBUG PILOT STATUS STATUS]:", response.status);
    console.log("[DEBUG PILOT STATUS RESPONSE]:", data);

    if (response.ok) {
      console.log(`✅ [Pilot Status] Webhook registrado com SUCESSO!`);
      return true;
    }

    console.error("❌ [Pilot Status Error] Falha ao registrar webhook:", data);
    return false;
  } catch (error) {
    console.error(
      "❌ [Pilot Status Exception] Erro ao registrar webhook:",
      error,
    );
    return false;
  }
}
