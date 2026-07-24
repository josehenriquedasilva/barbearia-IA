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
export async function setWebhookForInstance(
  instanceId: string,
  numberApiKey?: string, // 👈 Adicionamos esse segundo parâmetro opcional aqui!
) {
  const apiKey =
    numberApiKey ||
    process.env.EVOLUTION_TENANT_KEY ||
    process.env.WHATSAPP_API_KEY ||
    process.env.EVOLUTION_API_KEY;

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://barbearia-ia.vercel.app";
  const webhookUrl = `${siteUrl.replace(/\/$/, "")}/api/whatsapp`;

  const rawBaseUrl =
    process.env.PILOT_STATUS_NATIVE_URL || "https://pilotstatus.com.br";
  let baseUrl = rawBaseUrl.replace(/\/$/, "");
  if (!baseUrl.endsWith("/v1")) {
    baseUrl = `${baseUrl}/v1`;
  }

  if (!apiKey) {
    console.error("[Pilot Status] API Key não encontrada.");
    return false;
  }

  const sendWebhookRequest = async (includeNumberIdInBody: boolean) => {
    const payload: Record<string, any> = {
      url: webhookUrl,
      name: `Barbearia IA - ${instanceId}`,
      events: ["message.received", "number.connected"],
    };

    if (includeNumberIdInBody && instanceId) {
      payload.whatsappNumberId = instanceId;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": apiKey as string,
    };

    if (includeNumberIdInBody && instanceId) {
      headers["x-whatsapp-number-id"] = instanceId;
    }

    return await fetch(`${baseUrl}/webhooks`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  };

  try {
    let response = await sendWebhookRequest(true);
    let data = await response.json();

    if (!response.ok && data?.code === "NUMBER_MISMATCH") {
      console.warn(
        "[Pilot Status] Retentando criar webhook sem vincular whatsappNumberId...",
      );
      response = await sendWebhookRequest(false);
      data = await response.json();
    }

    console.log("[DEBUG PILOT STATUS STATUS]:", response.status);
    console.log("[DEBUG PILOT STATUS RESPONSE]:", data);

    if (response.ok) {
      console.log(`[Pilot Status] Webhook registrado com sucesso!`);
      return true;
    } else {
      console.error("[Pilot Status Error] Falha ao registrar webhook:", data);
      return false;
    }
  } catch (error) {
    console.error("[Pilot Status Exception] Erro ao registrar webhook:", error);
    return false;
  }
}
