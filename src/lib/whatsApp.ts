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

  if (!rawBaseUrl || !apiKey || !instanceName) {
    console.error(
      "[WhatsApp Error] Parâmetros ou Variáveis de ambiente ausentes.",
      { rawBaseUrl: !!rawBaseUrl, apiKey: !!apiKey, instanceName },
    );
    return null;
  }

  let baseUrl = rawBaseUrl.replace(/\/$/, "");
  if (!baseUrl.endsWith("/v1")) {
    baseUrl = `${baseUrl}/v1`;
  }

  const url = `${baseUrl}/messages/send`;

  // Garante formato E.164 com o símbolo '+' (+55DDD9XXXXXXXX)
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
        "x-api-key": apiKey as string,
        "x-whatsapp-number-id": instanceName,
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

    // Pega o domínio garantindo compatibilidade com Vercel e remove trailing slashes
    const siteDomain =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "https://seu-dominio.com.br");

    const targetWebhookUrl = `${siteDomain.replace(/\/$/, "")}/api/whatsapp`;

    // 1. Busca TODOS os webhooks da conta tenant (SEM o header x-whatsapp-number-id no GET)
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

      // Encontra qualquer webhook existente que aponte para a nossa URL ou tenha o nosso ID/Nome
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

        // Se o número já está vinculado ao webhook existente, cancela a criação/atualização
        if (currentNumberIds.includes(numberId)) {
          console.log(
            `[Webhook] O número ${numberId} já está vinculado ao webhook ${existingWebhook.id}. Nenhuma ação necessária.`,
          );
          return;
        }

        // Se o webhook existe mas não tinha esse numberId, atualiza via PUT
        const updatedNumberIds = Array.from(
          new Set([...currentNumberIds, numberId]),
        );

        console.log(
          `[Webhook] Vinculando número ${numberId} ao webhook existente ${existingWebhook.id}...`,
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

    // 2. Se e somente se nenhum webhook foi encontrado, cria um novo (POST)
    console.log(
      `[Webhook] Criando webhook inicial para o número ${numberId}...`,
    );

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

export async function setInstanceSettings(instanceId: string) {
  try {
    const apiKey =
      process.env.EVOLUTION_TENANT_KEY ||
      process.env.PILOT_STATUS_API_KEY ||
      process.env.WHATSAPP_API_KEY;

    if (!apiKey) {
      console.error("[Settings Erro] API Key não encontrada.");
      return;
    }

    // Garante que o ID da instância esteja limpo para a URL
    const safeInstanceId = encodeURIComponent(instanceId);

    const res = await fetch(
      `https://pilotstatus.com.br/api/layer/evolution-v2/settings/set/${safeInstanceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
          "x-whatsapp-number-id": instanceId,
        },
        body: JSON.stringify({
          rejectCall: true,
          msgCall: "Este número aceita apenas mensagens de texto/áudio.",
          groupsIgnore: true,
          alwaysOnline: false,
          readMessages: false,
          readStatus: false,
          syncFullHistory: false,
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Settings Erro] Falha ao aplicar configurações:", errText);
    } else {
      console.log(
        `[Settings Sucesso] Configurações aplicadas com sucesso para: ${instanceId}`,
      );
    }
  } catch (error) {
    console.error("[Settings Exceção]:", error);
  }
}
