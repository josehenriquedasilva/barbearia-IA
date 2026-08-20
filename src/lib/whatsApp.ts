const PILOT_STATUS_NATIVE_URL =
  process.env.PILOT_STATUS_NATIVE_URL || "https://pilotstatus.com.br";

const API_KEY =
  process.env.PILOT_STATUS_API_KEY ||
  process.env.WHATSAPP_API_KEY ||
  process.env.EVOLUTION_TENANT_KEY ||
  "";

interface WebhookItem {
  id?: string;
  name?: string;
  url?: string;
  active?: boolean;
  whatsappNumberId?: string;
  whatsappNumberIds?: string[];
  whatsappNumbers?: (string | { id?: string })[];
}

interface WebhookListResponse {
  data?: WebhookItem[];
  webhooks?: WebhookItem[];
}

function getBaseUrl(): string {
  let url = PILOT_STATUS_NATIVE_URL.replace(/\/$/, "");
  if (!url.endsWith("/v1")) {
    url = `${url}/v1`;
  }
  return url;
}

export async function sendWhatsAppMessage(
  instanceName: string,
  number: string,
  text: string,
) {
  if (!PILOT_STATUS_NATIVE_URL || !API_KEY || !instanceName) {
    return null;
  }

  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/messages/send`;

  const cleanDigits = number.replace(/\D/g, "");
  const numberWithDDI = cleanDigits.startsWith("55")
    ? cleanDigits
    : `55${cleanDigits}`;
  const finalNumber = `+${numberWithDDI}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "x-whatsapp-number-id": instanceName,
      },
      body: JSON.stringify({
        destinationNumber: finalNumber,
        text: text,
      }),
    });

    if (!response.ok) return null;

    return await response.json();
  } catch {
    return null;
  }
}

export async function setWebhookForInstance(numberId: string) {
  try {
    const baseUrl = getBaseUrl();

    if (!API_KEY) return;

    const siteDomain =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "https://seu-dominio.com.br");

    const targetWebhookUrl = `${siteDomain.replace(/\/$/, "")}/api/whatsapp`;

    const listRes = await fetch(`${baseUrl}/webhooks`, {
      method: "GET",
      headers: {
        "x-api-key": API_KEY,
      },
      cache: "no-store",
    });

    if (listRes.ok) {
      const webhooks: WebhookListResponse | WebhookItem[] =
        await listRes.json();
      const items: WebhookItem[] = Array.isArray(webhooks)
        ? webhooks
        : webhooks.data || webhooks.webhooks || [];

      const existingWebhook = items.find((wh) => {
        const whUrlNormalized = (wh.url || "").replace(/\/$/, "");
        const targetUrlNormalized = targetWebhookUrl.replace(/\/$/, "");

        const isSameUrl = whUrlNormalized === targetUrlNormalized;
        const isSameName = wh.name === `Webhook Barbearia - ${numberId}`;

        const whNumberIds: string[] = Array.isArray(wh.whatsappNumberIds)
          ? wh.whatsappNumberIds
          : Array.isArray(wh.whatsappNumbers)
            ? wh.whatsappNumbers.map((n) =>
                typeof n === "object" && n !== null && "id" in n
                  ? String(n.id)
                  : String(n),
              )
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
            ? existingWebhook.whatsappNumbers.map((n) =>
                typeof n === "object" && n !== null && "id" in n
                  ? String(n.id)
                  : String(n),
              )
            : existingWebhook.whatsappNumberId
              ? [existingWebhook.whatsappNumberId]
              : [];

        if (currentNumberIds.includes(numberId)) {
          return;
        }

        const updatedNumberIds = Array.from(
          new Set([...currentNumberIds, numberId]),
        );

        await fetch(`${baseUrl}/webhooks/${existingWebhook.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": API_KEY,
            "x-whatsapp-number-id": numberId,
          },
          body: JSON.stringify({
            name: existingWebhook.name || `Webhook Barbearia`,
            url: targetWebhookUrl,
            events: ["*"],
            whatsappNumberIds: updatedNumberIds,
            active: true,
          }),
        });

        return;
      }
    }

    await fetch(`${baseUrl}/webhooks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "x-whatsapp-number-id": numberId,
      },
      body: JSON.stringify({
        name: `Webhook Barbearia - ${numberId}`,
        url: targetWebhookUrl,
        events: ["*"],
        whatsappNumberIds: [numberId],
        active: true,
      }),
    });
  } catch {}
}

export async function setInstanceSettings(numberId: string) {
  try {
    const baseUrl = getBaseUrl();

    if (!API_KEY) return;

    await fetch(`${baseUrl}/numbers/${numberId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
      },
      body: JSON.stringify({
        settings: {
          rejectCall: true,
          msgRejectCall: "Não atendo por aqui",
          ignoreGroups: true,
        },
      }),
    });
  } catch {}
}
