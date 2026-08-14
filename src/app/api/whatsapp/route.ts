import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { waitUntil } from "@vercel/functions";
import { sendWhatsAppMessage } from "@/lib/whatsApp";
import Groq, { toFile } from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Busca o áudio convertido em Base64 na API do Pilot Status caso o webhook não traga URL direta.
 * O endpoint 'getBase64FromMediaMessage' precisa do objeto de mensagem COMPLETO (com chaves de descriptografia).
 */
async function buscarBase64DaMidia(
  instanceName: string,
  messagePayload: any,
): Promise<string | null> {
  try {
    const rawUrl =
      process.env.PILOT_STATUS_NATIVE_URL || "https://pilotstatus.com.br";
    const baseUrl = rawUrl.replace(/\/v1\/?$/, "").replace(/\/$/, "");
    const apiKey = process.env.EVOLUTION_TENANT_KEY;

    if (!apiKey) {
      console.warn("[Pilot Status API] EVOLUTION_TENANT_KEY não definida.");
      return null;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      apikey: apiKey,
    };

    const urlBase64 = `${baseUrl}/chat/getBase64FromMediaMessage/${instanceName}`;
    console.log(
      `[Pilot Status API] Requisitando Base64 via POST: ${urlBase64}`,
    );

    // Garante que enviamos o objeto da mensagem no formato exigido pela Evolution
    const bodyPayload = {
      message: messagePayload?.message
        ? messagePayload.message
        : messagePayload,
      convertToMp3: false,
    };

    const resBase64 = await fetch(urlBase64, {
      method: "POST",
      headers,
      body: JSON.stringify(bodyPayload),
    });

    if (resBase64.ok) {
      const dataBase64 = await resBase64.json();
      const base64Result =
        dataBase64?.base64 ||
        dataBase64?.media ||
        dataBase64?.data ||
        dataBase64?.data?.base64;

      if (base64Result) return base64Result;
    } else {
      const errText = await resBase64.text();
      console.warn(
        `[Pilot Status API] Falha ao obter Base64 (HTTP ${resBase64.status}):`,
        errText.slice(0, 200),
      );
    }

    return null;
  } catch (err) {
    console.error(
      "[Pilot Status API Exceção] Erro ao buscar áudio por payload:",
      err,
    );
    return null;
  }
}

async function transcreverAudioComGroq(
  audioSource: string,
  filename: string = "audio.ogg",
): Promise<string> {
  try {
    if (!audioSource) return "";

    console.log(`[Groq] Processando áudio (${audioSource.slice(0, 40)}...)...`);

    let audioBuffer: Buffer;

    if (
      audioSource.startsWith("http://") ||
      audioSource.startsWith("https://")
    ) {
      const res = await fetch(audioSource);
      if (!res.ok) {
        console.error(
          `[Groq Erro] Falha ao baixar áudio da URL (HTTP ${res.status})`,
        );
        return "";
      }
      const arrayBuffer = await res.arrayBuffer();
      audioBuffer = Buffer.from(arrayBuffer);
    } else {
      // Limpa cabeçalhos data:audio/... se existirem
      const cleanBase64 = audioSource.includes(",")
        ? audioSource.split(",")[1]
        : audioSource;
      audioBuffer = Buffer.from(cleanBase64, "base64");
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      console.warn("[Groq Alerta] Buffer de áudio está vazio.");
      return "";
    }

    const file = await toFile(audioBuffer, filename);

    const transcription = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3-turbo",
      language: "pt",
    });

    console.log("[Groq] Transcrição concluída:", transcription.text);
    return transcription.text?.trim() || "";
  } catch (err) {
    console.error("[Groq Exceção] Erro ao transcrever no Groq:", err);
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

  console.log(`[Agrupador] Enviando para IA: "${combinedMessageText}"`);

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
      console.error(`[Agrupador Erro] Status ${aiResponse.status}`);
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

    // 1. Ignorar grupos
    const remoteJid = body.data?.key?.remoteJid || body.data?.from || "";
    const isGroup = body.data?.isGroup || remoteJid.includes("@g.us");

    if (isGroup) {
      return NextResponse.json({ ok: true, status: "group_ignored" });
    }

    // 2. Eventos válidos
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

    // 3. Instância
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

    // 4. Shop
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

    // 5. Identificação e Processamento de Áudio
    const isAudio =
      body.data?.type === "audio" ||
      body.data?.mediaType === "audio" ||
      body.data?.messageType === "audioMessage" ||
      body.data?.messageType === "audio" ||
      !!body.data?.message?.audioMessage;

    let messageText = "";

    if (isAudio) {
      // Procura por links duráveis ou base64 direto no payload do webhook
      let audioSource =
        body.data?.mediaLink ||
        body.data?.mediaUrl ||
        body.data?.message?.audioMessage?.base64 ||
        body.data?.base64 ||
        (body.data?.url?.startsWith("http") ? body.data.url : null) ||
        (body.data?.media?.url?.startsWith("http")
          ? body.data.media.url
          : null);

      // Se não veio no webhook ou veio um link criptografado do WhatsApp (mmg.whatsapp.net), busca via API passando a mensagem completa
      if (!audioSource) {
        console.warn(
          "[Webhook Warning] Áudio sem URL/Base64 no payload. Requisitando à API do Pilot Status...",
        );
        const fullMessagePayload = body.data?.message
          ? body.data.message
          : body.data;
        audioSource = await buscarBase64DaMidia(
          instanceName,
          fullMessagePayload,
        );
      }

      const mediaFilename = body.data?.mediaFilename || "voice.ogg";

      if (audioSource) {
        console.log(
          `[Webhook] Fonte do áudio encontrada. Transcrevendo na Groq...`,
        );
        messageText = await transcreverAudioComGroq(audioSource, mediaFilename);
      } else {
        console.warn(
          "[Webhook Warning] Não foi possível resgatar o áudio por nenhuma via.",
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
      return NextResponse.json({ ok: true, status: "empty-text" });
    }

    // 6. Salvar mensagem
    const currentMsg = await prisma.chatMessage.create({
      data: {
        role: "user",
        content: messageText.trim(),
        shopId: shop.id,
        clientPhone,
        processed: false,
      },
    });

    // 7. Processar IA em segundo plano
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
