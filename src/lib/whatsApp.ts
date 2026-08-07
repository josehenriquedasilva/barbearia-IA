const PILOT_STATUS_NATIVE_URL =
  process.env.PILOT_STATUS_NATIVE_URL || "https://pilotstatus.com.br";
const EVOLUTION_TENANT_KEY =
  process.env.EVOLUTION_TENANT_KEY ||
  process.env.PILOT_STATUS_API_KEY ||
  process.env.WHATSAPP_API_KEY;

export async function sendWhatsAppMessage(
  instanceName: string,
  number: string,
  text: string,
) {
  if (!PILOT_STATUS_NATIVE_URL || !EVOLUTION_TENANT_KEY || !instanceName) {
    console.error(
      "[WhatsApp Error] Parâmetros ou Variáveis de ambiente ausentes.",
      {
        rawBaseUrl: !!PILOT_STATUS_NATIVE_URL,
        apiKey: !!EVOLUTION_TENANT_KEY,
        instanceName,
      },
    );
    return null;
  }

  let baseUrl = PILOT_STATUS_NATIVE_URL.replace(/\/$/, "");
  if (!baseUrl.endsWith("/v1")) {
    baseUrl = `${baseUrl}/v1`;
  }

  const url = `${baseUrl}/messages/send`;

  const cleanDigits = number.replace(/\D/g, "");
  const numberWithDDI = cleanDigits.startsWith("55")
    ? cleanDigits
    : `55${cleanDigits}`;
  const finalNumber = `+${numberWithDDI}`;

  try {
    console.log(
      `[WhatsApp Send] Enviando mensagem para ${finalNumber} via numberId: ${instanceName}...`,
    );

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": EVOLUTION_TENANT_KEY,
        "x-whatsapp-number-id": instanceName,
      },
      body: JSON.stringify({
        destinationNumber: finalNumber,
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
    console.log("[WhatsApp Send Sucesso]:", data);
    return data;
  } catch (error) {
    console.error("[WhatsApp Send Exception]:", error);
    return null;
  }
}

export async function setWebhookForInstance(numberId: string) {
  try {
    let rawBaseUrl =
      process.env.PILOT_STATUS_NATIVE_URL || "https://pilotstatus.com.br";
    let baseUrl = rawBaseUrl.replace(/\/$/, "");
    if (!baseUrl.endsWith("/v1")) {
      baseUrl = `${baseUrl}/v1`;
    }

    const apiKey =
      process.env.EVOLUTION_TENANT_KEY ||
      process.env.PILOT_STATUS_API_KEY ||
      process.env.WHATSAPP_API_KEY;

    if (!apiKey) {
      console.error("[Webhook Erro] API Key não configurada.");
      return;
    }

    const siteDomain =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "https://seu-dominio.com.br");

    const targetWebhookUrl = `${siteDomain.replace(/\/$/, "")}/api/whatsapp`;

    const listRes = await fetch(`${baseUrl}/webhooks`, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
      },
      cache: "no-store",
    });

    if (listRes.ok) {
      const webhooks = await listRes.json();
      const items: any[] = Array.isArray(webhooks)
        ? webhooks
        : webhooks.data || webhooks.webhooks || [];

      const existingWebhook = items.find((wh: any) => {
        const whUrlNormalized = (wh.url || "").replace(/\/$/, "");
        const targetUrlNormalized = targetWebhookUrl.replace(/\/$/, "");

        const isSameUrl = whUrlNormalized === targetUrlNormalized;
        const isSameName = wh.name === `Webhook Barbearia - ${numberId}`;

        const whNumberIds: string[] = Array.isArray(wh.whatsappNumberIds)
          ? wh.whatsappNumberIds
          : Array.isArray(wh.whatsappNumbers)
            ? wh.whatsappNumbers.map((n: any) => n.id || n)
            : wh.whatsappNumberId
              ? [wh.whatsappNumberId]
              : [];

        const hasNumber = whNumberIds.includes(numberId);

        return (isSameUrl || isSameName || hasNumber) && wh.active !== false;
      });

      if (existingWebhook) {
        const currentNumberIds: string[] = Array.isArray(
          existingWebhook.whatsappNumberIds,
        )
          ? existingWebhook.whatsappNumberIds
          : Array.isArray(existingWebhook.whatsappNumbers)
            ? existingWebhook.whatsappNumbers.map((n: any) => n.id || n)
            : existingWebhook.whatsappNumberId
              ? [existingWebhook.whatsappNumberId]
              : [];

        if (currentNumberIds.includes(numberId)) {
          console.log(
            `[Webhook] O número ${numberId} já está vinculado ao webhook ${existingWebhook.id}. Nenhuma ação necessária.`,
          );
          return;
        }

        const updatedNumberIds = Array.from(
          new Set([...currentNumberIds, numberId]),
        );

        const updateRes = await fetch(
          `${baseUrl}/webhooks/${existingWebhook.id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "x-whatsapp-number-id": numberId,
            },
            body: JSON.stringify({
              name: existingWebhook.name || `Webhook Barbearia`,
              url: targetWebhookUrl,
              events: existingWebhook.events || [
                "message.received",
                "messages.upsert",
              ],
              whatsappNumberId: numberId,
              whatsappNumberIds: updatedNumberIds,
              active: true,
            }),
          },
        );

        if (updateRes.ok) {
          console.log(
            `[Webhook Sucesso] Número ${numberId} adicionado ao webhook existente com sucesso!`,
          );
          return;
        }
      }
    }

    const createRes = await fetch(`${baseUrl}/webhooks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "x-whatsapp-number-id": numberId,
      },
      body: JSON.stringify({
        name: `Webhook Barbearia - ${numberId}`,
        url: targetWebhookUrl,
        events: ["message.received", "messages.upsert"],
        whatsappNumberId: numberId,
        whatsappNumberIds: [numberId],
        active: true,
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error("[Webhook Erro] Falha ao registrar webhook:", errText);
    } else {
      console.log(
        `[Webhook Sucesso] Webhook criado com sucesso para o número ${numberId}!`,
      );
    }
  } catch (error) {
    console.error("[Webhook Exceção]:", error);
  }
}

export async function setInstanceSettings(numberId: string) {
  let rawBaseUrl =
    process.env.PILOT_STATUS_NATIVE_URL || "https://pilotstatus.com.br";
  let baseUrl = rawBaseUrl.replace(/\/$/, "");
  if (!baseUrl.endsWith("/v1")) {
    baseUrl = `${baseUrl}/v1`;
  }

  const apiKey =
    process.env.EVOLUTION_TENANT_KEY ||
    process.env.PILOT_STATUS_API_KEY ||
    process.env.WHATSAPP_API_KEY;

  // Endpoint correto: PATCH /v1/numbers/{id}
  const response = await fetch(`${baseUrl}/numbers/${numberId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey as string,
    },
    body: JSON.stringify({
      settings: {
        rejectCall: true,
        msgRejectCall: "Não atendo por aqui",
        ignoreGroups: true, // Nome correto segundo o suporte
        // webhookHistoricalMessages: false (padrão já é false)
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.error(
      `[Pilot Status] Erro ao atualizar configurações do número ${numberId}:`,
      err,
    );
  } else {
    console.log(
      `[Pilot Status] Configurações aplicadas com sucesso para o número ${numberId}`,
    );
  }
}
