import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { waitUntil } from "@vercel/functions";

// 🎙️ Nova função que pede o áudio descriptografado para a Evolution e manda para o Groq
async function transcreverAudioComGroq(
  messageId: string,
  instanceName: string,
): Promise<string> {
  try {
    // Aguarda 1 segundo para garantir que a Evolution terminou de registrar a mídia no banco dela
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log(
      `[Groq] Solicitando mídia descriptografada para a mensagem: ${messageId}`,
    );

    // 1. Busca o Base64 do áudio descriptografado pela Evolution
    const responseMedia = await fetch(
      `${process.env.NEXT_PUBLIC_EVOLUTION_URL}/chat/getBase64FromMediaMessage/${instanceName}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.EVOLUTION_API_KEY as string,
        },
        body: JSON.stringify({
          message: {
            key: {
              id: messageId,
            },
          },
          convertToMp4: false,
        }),
      },
    );

    if (!responseMedia.ok) {
      const errText = await responseMedia.text();
      console.error("[Evolution Media Error]", errText);
      throw new Error("Não foi possível obter a mídia da Evolution API");
    }

    const mediaData = await responseMedia.json();
    let base64String = mediaData.base64 || mediaData.response?.base64;

    if (!base64String) {
      console.error(
        "[Evolution Media Error] Base64 não encontrado na resposta.",
      );
      throw new Error("Base64 vazio");
    }

    // Remove o cabeçalho data:audio/... se existir na string
    if (base64String.includes(",")) {
      base64String = base64String.split(",")[1];
    }

    // 2. Transforma o Base64 em um arquivo binário (Blob) legível para o Groq
    const audioBuffer = Buffer.from(base64String, "base64");
    const audioBlob = new Blob([audioBuffer], { type: "audio/ogg" });

    const formData = new FormData();
    formData.append("file", audioBlob, "audio.ogg");
    formData.append("model", "whisper-large-v3-turbo");
    formData.append("language", "pt");

    // 3. Envia o arquivo descriptografado para o Groq
    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: formData,
      },
    );

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error("[Groq Error]", errorText);
      throw new Error("Falha na transcrição do Groq");
    }

    const groqData = await groqResponse.json();
    return groqData.text || "";
  } catch (err) {
    console.error("Erro ao processar transcrição no Groq:", err);
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
  await new Promise((resolve) => setTimeout(resolve, 4000));

  const latestUserMsg = await prisma.chatMessage.findFirst({
    where: { shopId, clientPhone, role: "user" },
    orderBy: { id: "desc" },
  });

  if (!latestUserMsg || latestUserMsg.id !== currentMsgId) {
    console.log(`[Agrupador] Ignorando mensagem antiga ${currentMsgId}.`);
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

  console.log(`[Agrupador] Enviando bloco para o Gemini.`);
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `https://${host}`;

  const aiResponse = await fetch(`${baseUrl}/api/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: combinedMessageText,
      shopId,
      clientPhone,
    }),
  });

  const dataIA = await aiResponse.json();
  const content = dataIA.ai_response || dataIA.message;

  if (content) {
    const parts = Array.isArray(content) ? content : [content];
    for (const textPart of parts) {
      await fetch(
        `${process.env.NEXT_PUBLIC_EVOLUTION_URL}/message/sendText/${instanceName}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: process.env.EVOLUTION_API_KEY as string,
          },
          body: JSON.stringify({
            number: `55${clientPhone}`,
            text: textPart.trim(),
            delay: 1200,
          }),
        },
      );
    }
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const rawEvent = body.event || "";
    const event = rawEvent.toUpperCase();
    const fromMe = body.data?.key?.fromMe;

    const isCorrectEvent =
      event === "MESSAGES.UPSERT" || event === "MESSAGES_UPSERT";

    if (!isCorrectEvent || fromMe === true) {
      return NextResponse.json({ ok: true, status: "ignored" });
    }

    const instanceName = body.instance;
    const shop = await prisma.shop.findUnique({
      where: { whatsappInstance: instanceName },
    });

    if (!shop)
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });

    const remoteJid = body.data?.key?.remoteJid;
    const clientPhone = remoteJid.split("@")[0].replace(/^55/, "");

    let messageText =
      body.data.message?.conversation ||
      body.data.message?.extendedTextMessage?.text ||
      "";

    const messageId = body.data?.key?.id;
    const isAudio =
      body.data.messageType === "audioMessage" ||
      body.data.message?.audioMessage;

    // Se for áudio, pegamos o ID da mensagem e acionamos a descriptografia + Groq
    if (isAudio && messageId) {
      console.log(
        "[Webhook] Áudio detectado! Iniciando extração e transcrição via Groq...",
      );
      messageText = await transcreverAudioComGroq(messageId, instanceName);
      console.log(`[Webhook] Transcrição do Groq concluída: "${messageText}"`);
    }

    if (!messageText) {
      return NextResponse.json({ ok: true, status: "empty-text" });
    }

    const currentMsg = await prisma.chatMessage.create({
      data: {
        role: "user",
        content: messageText,
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
      }).catch((err) => console.error("Erro background:", err)),
    );

    return NextResponse.json({ status: "processing" });
  } catch (error) {
    console.error("Erro Crítico:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
