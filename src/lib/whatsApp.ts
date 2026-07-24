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
// @/lib/whatsapp.ts

/**
 * Busca a API Key específica de um determinado número no Pilot Status
 */
async function getApiKeyForNumber(instanceId: string): Promise<string | null> {
  try {
    const tenantApiKey = process.env.EVOLUTION_TENANT_KEY as string;
    let rawBaseUrl =
      process.env.PILOT_STATUS_NATIVE_URL || "https://pilotstatus.com.br";
    let baseUrl = rawBaseUrl.replace(/\/$/, "");
    if (!baseUrl.endsWith("/v1")) {
      baseUrl = `${baseUrl}/v1`;
    }

    // Busca a lista de API Keys vinculadas à conta Tenant
    const res = await fetch(`${baseUrl}/api-keys`, {
      method: "GET",
      headers: {
        "x-api-key": tenantApiKey,
      },
    });

    if (!res.ok) {
      console.error(
        "[Pilot Status] Erro ao listar API Keys:",
        await res.text(),
      );
      return null;
    }

    const data = await res.json();
    const keysList = Array.isArray(data) ? data : data.data || data.keys || [];

    // Encontra a chave pertencente ao whatsappNumberId/instanceId
    const found = keysList.find(
      (k: any) =>
        k.whatsappNumberId === instanceId ||
        k.numberId === instanceId ||
        k.number?.id === instanceId ||
        k.instanceId === instanceId,
    );

    const individualKey = found?.key || found?.apiKey || found?.token;

    if (individualKey) {
      console.log(
        `[Pilot Status] API Key individual encontrada para o número ${instanceId}: "${individualKey.slice(0, 8)}..."`,
      );
      return individualKey;
    }

    console.warn(
      `[Pilot Status] Nenhuma API Key individual encontrada para o ID ${instanceId}`,
    );
    return null;
  } catch (error) {
    console.error("[Pilot Status] Exceção ao buscar API Key do número:", error);
    return null;
  }
}

/**
 * Registra o Webhook utilizando a API Key individual do número
 */
export async function setWebhookForInstance(instanceId: string) {
  // 1. Busca a API Key individual do número
  const numberApiKey = await getApiKeyForNumber(instanceId);

  if (!numberApiKey) {
    console.error(
      `[Pilot Status Error] Impossível criar webhook: API Key individual não encontrada para o número ${instanceId}.`,
    );
    return false;
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://barbearia-ia.vercel.app";
  const webhookUrl = `${siteUrl.replace(/\/$/, "")}/api/whatsapp`;

  let rawBaseUrl =
    process.env.PILOT_STATUS_NATIVE_URL || "https://pilotstatus.com.br";
  let baseUrl = rawBaseUrl.replace(/\/$/, "");
  if (!baseUrl.endsWith("/v1")) {
    baseUrl = `${baseUrl}/v1`;
  }

  try {
    // 2. Faz o registro do webhook passando a API Key do número
    const response = await fetch(`${baseUrl}/webhooks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": numberApiKey, // 👈 USANDO A CHAVE INDIVIDUAL DO NÚMERO
      },
      body: JSON.stringify({
        url: webhookUrl,
        name: `Barbearia IA - ${instanceId}`,
        events: ["message.received", "number.connected"],
        whatsappNumberId: instanceId,
      }),
    });

    const data = await response.json();

    console.log("[DEBUG PILOT STATUS STATUS]:", response.status);
    console.log("[DEBUG PILOT STATUS RESPONSE]:", data);

    if (response.ok) {
      console.log(
        `[Pilot Status] Webhook registrado com SUCESSO para o número ${instanceId}!`,
      );
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
