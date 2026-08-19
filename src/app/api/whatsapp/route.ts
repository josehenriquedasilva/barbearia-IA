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

    console.log(`[Groq] Baixando áudio diretamente do mediaLink...`);

    const response = await fetch(mediaLink, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      if (response.status === 403) {
        console.error(
          `[Groq Erro] HTTP 403 Forbidden: O mediaLink do S3 provavelmente expirou ou a URL veio truncada no webhook.`,
        );
      } else {
        console.error(
          `[Groq Erro] Falha ao baixar áudio (HTTP ${response.status}: ${response.statusText})`,
        );
      }
      return "";
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    if (!audioBuffer || audioBuffer.length === 0) {
      console.warn("[Groq Alerta] O buffer do áudio baixado veio vazio.");
      return "";
    }

    const file = await toFile(audioBuffer, filename);

    const transcription = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3-turbo",
      language: "pt",
    });

    console.log(
      "[Groq] Transcrição concluída com sucesso:",
      transcription.text,
    );
    return transcription.text?.trim() || "";
  } catch (err) {
    console.error(
      "[Groq Exceção] Erro durante o download ou transcrição:",
      err,
    );
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

  console.log(`[Agrupador] Enviando para a IA: "${combinedMessageText}"`);

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

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error(
        `[Agrupador Erro] Rota /api/schedule retornou HTTP ${aiResponse.status}:`,
        errText,
      );
      return;
    }

    const dataIA = await aiResponse.json();
    const content = dataIA.ai_response || dataIA.message || dataIA.response;

    if (!content) return;

    const parts = Array.isArray(content) ? content : [content];

    for (const textPart of parts) {
      if (!textPart || !textPart.trim()) continue;
      await sendWhatsAppMessage(instanceName, clientPhone, textPart.trim());
    }
  } catch (err) {
    console.error("[Agrupador Exceção Crítica]:", err);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const remoteJid = body.data?.key?.remoteJid || body.data?.from || "";
    const isGroup = body.data?.isGroup || remoteJid.includes("@g.us");

    if (isGroup) {
      return NextResponse.json({ ok: true, status: "group_ignored" });
    }

    const rawEvent = (body.event || body.data?.event || "").toLowerCase();
    const fromMe = body.data?.fromMe ?? body.data?.key?.fromMe ?? false;

    const isCorrectEvent =
      rawEvent === "message.received" ||
      rawEvent === "messages.upsert" ||
      rawEvent === "messages_upsert" ||
      rawEvent === "messages_send";

    if (!isCorrectEvent || fromMe === true) {
      return NextResponse.json({ ok: true, status: "ignored" });
    }

    const instanceName =
      body.data?.numberId ||
      body.instance ||
      body.instanceId ||
      body.data?.instance;

    if (!instanceName) {
      return NextResponse.json(
        { error: "Instance ID / Number ID missing" },
        { status: 400 },
      );
    }

    const recipientPhone = (body.data?.to || "").replace(/\D/g, "");
    const cleanRecipient = recipientPhone.replace(/^55/, "");

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

    const rawClientPhone = body.data?.from || body.data?.key?.remoteJid || "";
    const clientPhone = rawClientPhone.replace(/\D/g, "").replace(/^55/, "");

    const isAudio =
      body.data?.type === "audio" ||
      body.data?.mediaType === "audio" ||
      body.data?.messageType === "audioMessage" ||
      body.data?.messageType === "audio" ||
      !!body.data?.message?.audioMessage;

    let messageText = "";

    if (isAudio) {
      const mediaLink =
        body.data?.mediaLink ||
        body.data?.mediaUrl ||
        body.data?.media?.url ||
        body.data?.message?.audioMessage?.url ||
        body.data?.url;

      const mediaFilename =
        body.data?.mediaFilename ||
        body.data?.message?.audioMessage?.fileName ||
        "voice.ogg";

      if (mediaLink) {
        console.log(
          `[Webhook] Áudio recebido de ${clientPhone}. Baixando imediatamente via mediaLink...`,
        );
        messageText = await transcreverAudioComGroq(mediaLink, mediaFilename);
      } else {
        console.warn(
          "[Webhook Warning] Mensagem de áudio identificada, mas nenhum mediaLink foi encontrado no payload.",
        );
      }
    } else {
      messageText =
        body.data?.content ||
        body.data?.message?.conversation ||
        body.data?.message?.extendedTextMessage?.text ||
        "";
    }

    const effectiveInstance = instanceName || shop.whatsappInstance;

    if (!messageText || !messageText.trim()) {
      console.warn(
        "[Webhook] Transcrição ou mensagem em texto veio vazia. Ignorando.",
      );
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

    console.log(`[Webhook] Mensagem #${currentMsg.id} salva: "${messageText}"`);

    waitUntil(
      processBackgroundAi({
        currentMsgId: currentMsg.id,
        shopId: shop.id,
        clientPhone,
        instanceName: effectiveInstance,
        host: request.headers.get("host") || "",
      }).catch((err) => console.error("Erro background:", err)),
    );

    return NextResponse.json({ status: "processing" });
  } catch (error) {
    console.error("Erro Crítico no Webhook WhatsApp:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
