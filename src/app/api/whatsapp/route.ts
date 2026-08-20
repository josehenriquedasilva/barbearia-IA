import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { waitUntil } from "@vercel/functions";
import { sendWhatsAppMessage } from "@/lib/whatsApp";
import Groq, { toFile } from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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

async function processBackgroundAi({
  currentMsgId,
  shopId,
  clientPhone,
  instanceName,
  host,
}: {
  currentMsgId: number;
  shopId: number;
  clientPhone: string;
  instanceName: string;
  host: string;
}) {
  await new Promise((resolve) => setTimeout(resolve, 3000));

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

    const aiResponse = await fetch(`${baseUrl}/api/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: combinedMessageText,
        shopId,
        clientPhone,
        currentMessageIds: idsToUpdate,
      }),
    });

    if (!aiResponse.ok) return;

    const dataIA = await aiResponse.json();
    const content = dataIA.ai_response || dataIA.message || dataIA.response;

    if (!content) return;

    const parts = Array.isArray(content) ? content : [content];

    for (const textPart of parts) {
      if (!textPart || !textPart.trim()) continue;
      await sendWhatsAppMessage(instanceName, clientPhone, textPart.trim());
    }
  } catch {}
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const event = (body.event || "").toLowerCase();
    const data = body.data;

    if (event !== "message.received" && event !== "message.reply") {
      return NextResponse.json({ ok: true, status: "ignored_event" });
    }

    if (data?.fromMe === true) {
      return NextResponse.json({ ok: true, status: "ignored_from_me" });
    }

    const instanceName = data?.numberId;
    if (!instanceName) {
      return NextResponse.json({ error: "numberId missing" }, { status: 400 });
    }

    const recipientPhone = (data?.to || "").replace(/\D/g, "");
    const cleanRecipient = recipientPhone.replace(/^55/, "");

    const rawClientPhone = data?.from || "";
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
    });

    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const isAudio = data?.type === "audio";
    let messageText = "";

    if (isAudio) {
      const mediaLink = data?.mediaLink;
      const mediaFilename = data?.mediaFilename || "voice.ogg";

      if (mediaLink) {
        messageText = await transcreverAudioComGroq(mediaLink, mediaFilename);
      }
    } else {
      messageText = data?.content || "";
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
      processBackgroundAi({
        currentMsgId: currentMsg.id,
        shopId: shop.id,
        clientPhone,
        instanceName,
        host: request.headers.get("host") || "",
      }).catch(() => {}),
    );

    return NextResponse.json({ status: "processing" });
  } catch {
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
