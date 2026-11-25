const PILOT_STATUS_NATIVE_URL = process.env.PILOT_STATUS_NATIVE_URL;
const API_KEY = process.env.EVOLUTION_TENANT_KEY;

export interface WhatsAppReplyButton {
  type?: "reply";
  id: string;
  displayText: string;
}

export interface WhatsAppListRow {
  id: string;
  title: string;
  description?: string;
}

export interface WhatsAppListSection {
  title?: string;
  rows: WhatsAppListRow[];
}

export interface WhatsAppInteractiveList {
  buttonText: string;
  sections: WhatsAppListSection[];
}

export interface SendWhatsAppPayloadOptions {
  buttons?: WhatsAppReplyButton[];
  list?: WhatsAppInteractiveList;
  footer?: string;
}

interface DeletePilotStatusParams {
  baseUrl: string;
  apiKey: string;
  numberId?: string | null;
  instanceId?: string | null;
}

interface WebhookItem {
  id: string;
  name?: string;
  url?: string;
  active?: boolean;
  whatsappNumberId?: string;
  whatsappNumberIds?: string[];
  whatsappNumbers?: Array<string | { id: string | number }>;
}

type WebhookListResponse =
  | WebhookItem[]
  | { data?: WebhookItem[]; webhooks?: WebhookItem[] };

export async function sendWhatsAppMessage(
  instanceName: string,
  number: string,
  text: string,
  options?: SendWhatsAppPayloadOptions,
) {
  if (!PILOT_STATUS_NATIVE_URL || !API_KEY || !instanceName) {
    return null;
  }

  const baseUrl = PILOT_STATUS_NATIVE_URL.replace(/\/+$/, "");
  const url = `${baseUrl}/messages/send`;

  const cleanDigits = number.replace(/\D/g, "");
  const numberWithDDI = cleanDigits.startsWith("55")
    ? cleanDigits
    : `55${cleanDigits}`;
  const finalNumber = `+${numberWithDDI}`;

  const payload: Record<string, unknown> = {
    destinationNumber: finalNumber,
    text,
  };

  if (options?.list) {
    payload.list = {
      buttonText: options.list.buttonText.slice(0, 20),
      sections: options.list.sections.slice(0, 10).map((sec) => ({
        ...(sec.title ? { title: sec.title.slice(0, 24) } : {}),
        rows: sec.rows.slice(0, 10).map((row) => ({
          id: row.id.slice(0, 200),
          title: row.title.slice(0, 24),
          ...(row.description
            ? { description: row.description.slice(0, 72) }
            : {}),
        })),
      })),
    };
    if (options.footer) {
      payload.footer = options.footer.slice(0, 60);
    }
  } else if (options?.buttons && options.buttons.length > 0) {
    payload.buttons = options.buttons.slice(0, 3).map((btn, idx) => ({
      type: "reply",
      id: (btn.id || `btn_${idx + 1}`).slice(0, 200),
      displayText: btn.displayText.slice(0, 20),
    }));
    if (options.footer) {
      payload.footer = options.footer.slice(0, 60);
    }
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "x-whatsapp-number-id": instanceName,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) return null;

    return await response.json();
  } catch {
    return null;
  }
}

export async function deletePilotStatusNumberAndWebhooks({
  baseUrl,
  apiKey,
  numberId,
  instanceId,
}: DeletePilotStatusParams): Promise<boolean> {
  const targetId = numberId || instanceId;

  if (!targetId) {
    return true;
  }

  try {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, "").endsWith("/v1")
      ? baseUrl.replace(/\/+$/, "")
      : `${baseUrl.replace(/\/+$/, "")}/v1`;

    if (numberId) {
      const headers = {
        "x-api-key": apiKey,
        "x-whatsapp-number-id": numberId,
      };

      const webhooksRes = await fetch(`${normalizedBaseUrl}/webhooks`, {
        method: "GET",
        headers,
        cache: "no-store",
      });

      if (webhooksRes.ok) {
        const webhooksData = (await webhooksRes
          .json()
          .catch(() => [])) as WebhookListResponse;
        const list: WebhookItem[] = Array.isArray(webhooksData)
          ? webhooksData
          : (webhooksData.webhooks ?? webhooksData.data ?? []);

        for (const wh of list) {
          if (!wh?.id) continue;

          await fetch(`${normalizedBaseUrl}/webhooks/${wh.id}`, {
            method: "DELETE",
            headers,
          });
        }
      }
    }

    const delNumRes = await fetch(`${normalizedBaseUrl}/numbers/${targetId}`, {
      method: "DELETE",
      headers: {
        "x-api-key": apiKey,
      },
    });

    if (!delNumRes.ok && delNumRes.status !== 404) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function setWebhookForInstance(
  baseUrl: string,
  apiKey: string,
  numberId: string,
  shopName?: string,
): Promise<void> {
  try {
    if (!baseUrl || !apiKey || !numberId) return;

    const siteDomain = process.env.NEXT_PUBLIC_SITE_URL;
    if (!siteDomain) return;

    const targetWebhookUrl = `${siteDomain}/api/whatsapp`;
    const webhookName = shopName
      ? `Webhook - ${shopName}`
      : `Webhook - ${numberId}`;

    const headers = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "x-whatsapp-number-id": numberId,
    };

    const selectedEvents = [
      "message.received",
      "message.reply",
      "number.connected",
      "number.disconnected",
      "message.read",
      "message.failed",
    ];

    const listRes = await fetch(`${baseUrl}/webhooks`, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (listRes.ok) {
      const webhooks = (await listRes.json()) as WebhookListResponse;
      const items: WebhookItem[] = Array.isArray(webhooks)
        ? webhooks
        : webhooks.data || webhooks.webhooks || [];

      const existingWebhook = items.find((wh) => {
        const whUrlNormalized = (wh.url || "").replace(/\/$/, "");
        const targetUrlNormalized = targetWebhookUrl.replace(/\/$/, "");

        const isSameUrl = whUrlNormalized === targetUrlNormalized;
        const isSameName = wh.name === webhookName;

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

        const updatedNumberIds = Array.from(
          new Set([...currentNumberIds, numberId]),
        );

        await fetch(`${baseUrl}/webhooks/${existingWebhook.id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({
            name: webhookName,
            url: targetWebhookUrl,
            events: selectedEvents,
            whatsappNumberId: numberId,
            whatsappNumberIds: updatedNumberIds,
            active: true,
          }),
        });

        return;
      }
    }

    await fetch(`${baseUrl}/webhooks`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: webhookName,
        url: targetWebhookUrl,
        events: selectedEvents,
        whatsappNumberId: numberId,
        whatsappNumberIds: [numberId],
        active: true,
      }),
    });
  } catch {}
}

export async function setInstanceSettings(
  baseUrl: string,
  apiKey: string,
  numberId: string,
): Promise<void> {
  try {
    await fetch(`${baseUrl}/numbers/${numberId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        settings: {
          rejectCall: true,
          msgRejectCall: "Este número não aceita chamadas de áudio ou vídeo.",
          ignoreGroups: true,
          ignoreStatus: true,
          ignoreNewsletters: true,
          alwaysOnline: false,
          readMessages: true,
          historyImportEnabled: false,
        },
      }),
    });
  } catch {}
}
