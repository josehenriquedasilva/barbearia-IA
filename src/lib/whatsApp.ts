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

    // URL do seu webhook no Next.js
    const targetWebhookUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://seu-dominio.com.br"}/api/webhook/whatsapp`;

    // 1. Consultar se já existe webhook cadastrado para este número
    const listRes = await fetch(`${baseUrl}/webhooks`, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "x-whatsapp-number-id": numberId, // Filtra estritamente os webhooks do número
      },
      cache: "no-store",
    });

    if (listRes.ok) {
      const webhooks = await listRes.json();
      const items = Array.isArray(webhooks) ? webhooks : webhooks.data || [];

      // Verifica se a sua URL já está cadastrada para este número
      const existingWebhook = items.find(
        (wh: any) => wh.url === targetWebhookUrl && wh.active === true,
      );

      if (existingWebhook) {
        console.log(
          `[Webhook] Webhook já configurado e ativo para o número ${numberId}. Ignorando criação duplicada.`,
        );
        return; // Interrompe para não duplicar!
      }
    }

    // 2. Se não encontrou um webhook existente, faz o cadastramento (POST)
    console.log(
      `[Webhook] Cadastrando novo webhook para o número ${numberId}...`,
    );

    const createRes = await fetch(`${baseUrl}/webhooks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        name: `Webhook Barbearia - ${numberId}`,
        url: targetWebhookUrl,
        events: ["message.received", "messages.upsert"],
        whatsappNumberIds: [numberId],
        active: true,
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error("[Webhook Erro] Falha ao registrar webhook:", errText);
    } else {
      console.log(
        `[Webhook Sucesso] Webhook vinculado com sucesso ao número ${numberId}!`,
      );
    }
  } catch (error) {
    console.error("[Webhook Exceção]:", error);
  }
}

export async function setInstanceSettings(instanceName: string) {
  try {
    const apiKey =
      process.env.EVOLUTION_TENANT_KEY ||
      process.env.PILOT_STATUS_API_KEY ||
      process.env.WHATSAPP_API_KEY;

    if (!apiKey) {
      console.error("[Settings Erro] API Key não encontrada.");
      return;
    }

    const res = await fetch(
      `https://pilotstatus.com.br/api/layer/evolution-v2/settings/set/${instanceName}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        body: JSON.stringify({
          rejectCall: true,
          msgCall: "Este número aceita apenas mensagens de texto/áudio.",
          groupsIgnore: true, // Ignora mensagens de grupos
          alwaysOnline: false,
          readMessages: false,
          readStatus: false,
          syncFullHistory: false, // Impede a sincronização de mensagens antigas
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Settings Erro] Falha ao aplicar configurações:", errText);
    } else {
      console.log(
        `[Settings Sucesso] Configurações aplicadas com sucesso para: ${instanceName}`,
      );
    }
  } catch (error) {
    console.error("[Settings Exceção]:", error);
  }
}
