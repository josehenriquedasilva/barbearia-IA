import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { waitUntil } from "@vercel/functions";
import { sendWhatsAppMessage } from "@/lib/whatsApp";
import Groq, { toFile } from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Fallback: Busca a mídia em Base64 na API do Pilot Status
 * caso o download direto via URL falhe (ex: erro HTTP 403/404).
 */
async function buscarBase64Fallback(
  instanceName: string,
  messagePayload: any,
): Promise<string | null> {
  try {
    const rawUrl =
      process.env.PILOT_STATUS_NATIVE_URL || "https://pilotstatus.com.br";
    const baseUrl = rawUrl.replace(/\/v1\/?$/, "").replace(/\/$/, "");
    const apiKey =
      process.env.EVOLUTION_TENANT_KEY || process.env.PILOT_STATUS_API_KEY;

    if (!apiKey) return null;

    const url = `${baseUrl}/chat/getBase64FromMediaMessage/${instanceName}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        apikey: apiKey,
      },
      body: JSON.stringify({
        message: messagePayload?.message
          ? messagePayload.message
          : messagePayload,
        convertToMp3: false,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return (
        data?.base64 || data?.media || data?.data?.base64 || data?.data || null
      );
    }
  } catch (err) {
    console.error("[Fallback Base64 Exceção]:", err);
  }
  return null;
}

/**
 * Transcreve áudio via Groq SDK aceitando URL ou Base64.
 */
async function transcreverAudioComGroq(
  audioSource: string,
  filename: string = "audio.ogg",
  instanceName?: string,
  fullMessagePayload?: any,
): Promise<string> {
  try {
    if (!audioSource) return "";

    console.log(
      `[Groq] Processando audioSource: ${audioSource.slice(0, 80)}...`,
    );

    let audioBuffer: Buffer | null = null;

    // Se for URL (ex: mediaLink do Pilot Status)
    if (
      audioSource.startsWith("http://") ||
      audioSource.startsWith("https://")
    ) {
      const apiKey =
        process.env.EVOLUTION_TENANT_KEY || process.env.PILOT_STATUS_API_KEY;

      // Monta headers autenticados para evitar erro 403 (Forbidden)
      const fetchHeaders: Record<string, string> = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      };

      if (apiKey) {
        fetchHeaders["apikey"] = apiKey;
        fetchHeaders["Authorization"] = `Bearer ${apiKey}`;
      }

      let res = await fetch(audioSource, { headers: fetchHeaders });

      // Se falhou (403, 404, etc) e temos dados para fallback, tenta via API do Pilot Status
      if (!res.ok && instanceName && fullMessagePayload) {
        console.warn(
          `[Groq Erro] HTTP ${res.status} ao baixar URL. Tentando fallback via API Base64...`,
        );
        const base64Fallback = await buscarBase64Fallback(
          instanceName,
          fullMessagePayload,
        );

        if (base64Fallback) {
          const cleanB64 = base64Fallback.includes(",")
            ? base64Fallback.split(",")[1]
            : base64Fallback;
          audioBuffer = Buffer.from(cleanB64, "base64");
        }
      } else if (res.ok) {
        const arrayBuffer = await res.arrayBuffer();
        audioBuffer = Buffer.from(arrayBuffer);
      } else {
        console.error(
          `[Groq Erro] Falha ao baixar áudio da URL (HTTP ${res.status}: ${res.statusText})`,
        );
      }
    } else {
      // Se já for Base64
      const cleanBase64 = audioSource.includes(",")
        ? audioSource.split(",")[1]
        : audioSource;
      audioBuffer = Buffer.from(cleanBase64, "base64");
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      console.warn("[Groq Alerta] Buffer de áudio está vazio.");
      return "";
    }

    // Cria o arquivo virtual para a SDK da Groq
    const file = await toFile(audioBuffer, filename);

    const transcription = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3-turbo",
      language: "pt",
    });

    console.log("[Groq] Transcrição concluída:", transcription.text);
    return transcription.text?.trim() || "";
  } catch (err) {
    console.error("[Groq Exceção] Erro ao processar transcrição no Groq:", err);
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

    // 1. Ignorar mensagens de grupos
    const remoteJid = body.data?.key?.remoteJid || body.data?.from || "";
    const isGroup = body.data?.isGroup || remoteJid.includes("@g.us");

    if (isGroup) {
      return NextResponse.json({ ok: true, status: "group_ignored" });
    }

    // 2. Filtro de eventos e ignorar mensagens 'fromMe'
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

    // 3. Obtenção da Instância / Number ID
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

    // 4. Localização do Shop
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

    // 5. Identificação e Processamento de Áudio vs Texto
    const isAudio =
      body.data?.type === "audio" ||
      body.data?.mediaType === "audio" ||
      body.data?.messageType === "audioMessage" ||
      body.data?.messageType === "audio" ||
      !!body.data?.message?.audioMessage;

    let messageText = "";

    if (isAudio) {
      const audioSource =
        body.data?.mediaLink ||
        body.data?.message?.audioMessage?.url ||
        body.data?.media?.url ||
        body.data?.mediaUrl ||
        body.data?.url ||
        body.data?.message?.audioMessage?.base64 ||
        body.data?.base64;

      const mediaFilename = body.data?.mediaFilename || "voice.ogg";
      const fullMessagePayload = body.data?.message
        ? body.data.message
        : body.data;

      if (audioSource) {
        console.log(
          `[Webhook] Áudio recebido de ${clientPhone}. Transcrevendo na Groq...`,
        );
        messageText = await transcreverAudioComGroq(
          audioSource,
          mediaFilename,
          instanceName,
          fullMessagePayload,
        );
      } else {
        console.warn(
          "[Webhook Warning] Mensagem de áudio sem `mediaLink` ou `base64` no payload.",
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

    // 6. Salvar mensagem no banco de dados
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

    // 7. Disparar processamento da IA
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
