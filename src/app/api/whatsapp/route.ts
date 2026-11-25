import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { waitUntil } from "@vercel/functions";
import {
  sendWhatsAppMessage,
  SendWhatsAppPayloadOptions,
} from "@/lib/whatsApp";
import Groq, { toFile } from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

interface OutgoingMessageItem {
  text?: string;
  buttons?: SendWhatsAppPayloadOptions["buttons"];
  list?: SendWhatsAppPayloadOptions["list"];
  footer?: string;
}

interface ParsedInboundMessage {
  text: string;
  interactiveId?: string;
}

function extractInboundMessage(
  data: Record<string, unknown>,
): ParsedInboundMessage {
  const interactive = data?.interactive as
    | {
        button_reply?: { id?: string; title?: string };
        list_reply?: { id?: string; title?: string };
      }
    | undefined;

  if (interactive?.button_reply) {
    return {
      text: (
        interactive.button_reply.title ||
        interactive.button_reply.id ||
        ""
      ).trim(),
      interactiveId: interactive.button_reply.id?.trim(),
    };
  }

  if (interactive?.list_reply) {
    return {
      text: (
        interactive.list_reply.title ||
        interactive.list_reply.id ||
        ""
      ).trim(),
      interactiveId: interactive.list_reply.id?.trim(),
    };
  }

  const buttonId =
    typeof data?.buttonId === "string" && data.buttonId.trim()
      ? data.buttonId.trim()
      : undefined;
  const content = typeof data?.content === "string" ? data.content.trim() : "";

  return {
    text: content || buttonId || "",
    interactiveId: buttonId,
  };
}

async function logoutWhatsAppInstance(instanceId: string): Promise<boolean> {
  try {
    const baseUrl = process.env.PILOT_STATUS_NATIVE_URL;
    const apiKey = process.env.EVOLUTION_TENANT_KEY;

    if (!apiKey || !instanceId) return false;

    const response = await fetch(`${baseUrl}/numbers/${instanceId}/logout`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
    });

    return response.ok;
  } catch (error) {
    console.error("Erro ao desconectar no Pilot Status via webhook:", error);
    return false;
  }
}

async function transcreverAudioComGroq(
  mediaLink: string,
  filename: string = "audio.ogg",
): Promise<string> {
  try {
    if (!mediaLink) return "";

    const response = await fetch(mediaLink, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) return "";

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    if (!audioBuffer || audioBuffer.length === 0) return "";

    const file = await toFile(audioBuffer, filename);

    const transcription = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3-turbo",
      language: "pt",
    });

    return transcription.text?.trim() || "";
  } catch {
    return "";
  }
}

async function processBackgroundFlow({
  currentMsgId,
  shopId,
  clientPhone,
  instanceName,
  host,
  interactiveId,
}: {
  currentMsgId: number;
  shopId: number;
  clientPhone: string;
  instanceName: string;
  host: string;
  interactiveId?: string;
}) {
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const latestUserMsg = await prisma.chatMessage.findFirst({
    where: { shopId, clientPhone, role: "user" },
    orderBy: { id: "desc" },
  });

  if (!latestUserMsg || latestUserMsg.id !== currentMsgId) {
    return;
  }

  const unreadUserMessages = await prisma.chatMessage.findMany({
    where: { shopId, clientPhone, role: "user", processed: false },
    orderBy: { id: "asc" },
  });

  if (unreadUserMessages.length === 0) return;

  const idsToUpdate = unreadUserMessages.map((m) => m.id);
  await prisma.chatMessage.updateMany({
    where: { id: { in: idsToUpdate } },
    data: { processed: true },
  });

  const combinedMessageText = unreadUserMessages
    .map((m) => m.content.trim())
    .join("\n");

  try {
    let protocol = "https://";
    if (host.includes("localhost") || host.includes("127.0.0.1")) {
      protocol = "http://";
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `${protocol}${host}`;

    const flowResponse = await fetch(`${baseUrl}/api/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: combinedMessageText,
        interactiveId,
        shopId,
        clientPhone,
        currentMessageIds: idsToUpdate,
      }),
    });

    if (!flowResponse.ok) return;

    const dataFlow = await flowResponse.json();
    const rawItems =
      dataFlow.messages ||
      dataFlow.ai_response ||
      dataFlow.message ||
      dataFlow.response;

    if (!rawItems) return;

    const items: OutgoingMessageItem[] = Array.isArray(rawItems)
      ? rawItems.map((entry) =>
          typeof entry === "string" ? { text: entry } : entry,
        )
      : [typeof rawItems === "string" ? { text: rawItems } : rawItems];

    for (const item of items) {
      const msgText = (item?.text || "").trim();
      if (!msgText && !item?.list && !item?.buttons) continue;

      await sendWhatsAppMessage(instanceName, clientPhone, msgText, {
        buttons: item?.buttons,
        list: item?.list,
        footer: item?.footer,
      });
    }
  } catch {}
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const event = (body.event || "").toLowerCase();
    const data = (body.data || {}) as Record<string, unknown>;

    if (event !== "message.received" && event !== "message.reply") {
      return NextResponse.json({ ok: true, status: "ignored_event" });
    }

    if (data?.fromMe === true) {
      return NextResponse.json({ ok: true, status: "ignored_from_me" });
    }

    const instanceName =
      typeof data?.numberId === "string" ? data.numberId : undefined;
    if (!instanceName) {
      return NextResponse.json({ error: "numberId missing" }, { status: 400 });
    }

    const rawTo = typeof data?.to === "string" ? data.to : "";
    const recipientPhone = rawTo.replace(/\D/g, "");
    const cleanRecipient = recipientPhone.replace(/^55/, "");

    const rawClientPhone = typeof data?.from === "string" ? data.from : "";
    const clientPhone = rawClientPhone.replace(/\D/g, "").replace(/^55/, "");

    const shop = await prisma.shop.findFirst({
      where: {
        OR: [
          { whatsappInstance: instanceName },
          { slug: instanceName },
          ...(recipientPhone
            ? [
                { whatsappToken: recipientPhone },
                { whatsappToken: cleanRecipient },
                { phone: cleanRecipient },
              ]
            : []),
        ],
      },
      select: {
        id: true,
        whatsappInstance: true,
        subscriptionStatus: true,
        subscriptionEnd: true,
      },
    });

    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const isExpired =
      shop.subscriptionStatus === "EXPIRED" ||
      (shop.subscriptionEnd && new Date(shop.subscriptionEnd) < new Date());

    if (isExpired) {
      if (shop.whatsappInstance) {
        await logoutWhatsAppInstance(shop.whatsappInstance);
      }

      return NextResponse.json({ ok: true, status: "subscription_expired" });
    }

    const isAudio = data?.type === "audio";
    let messageText = "";
    let interactiveId: string | undefined;

    if (isAudio) {
      const mediaLink =
        typeof data?.mediaLink === "string" ? data.mediaLink : "";
      const mediaFilename =
        typeof data?.mediaFilename === "string"
          ? data.mediaFilename
          : "voice.ogg";

      if (mediaLink) {
        messageText = await transcreverAudioComGroq(mediaLink, mediaFilename);
      }
    } else {
      const parsed = extractInboundMessage(data);
      messageText = parsed.text;
      interactiveId = parsed.interactiveId;
    }

    if (!messageText || !messageText.trim()) {
      return NextResponse.json({ ok: true, status: "empty-text" });
    }

    const currentMsg = await prisma.chatMessage.create({
      data: {
        role: "user",
        content: messageText.trim(),
        shopId: shop.id,
        clientPhone,
        processed: false,
      },
    });

    waitUntil(
      processBackgroundFlow({
        currentMsgId: currentMsg.id,
        shopId: shop.id,
        clientPhone,
        instanceName,
        host: request.headers.get("host") || "",
        interactiveId,
      }).catch(() => {}),
    );

    return NextResponse.json({ status: "processing" });
  } catch {
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
