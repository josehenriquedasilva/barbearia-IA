import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { waitUntil } from "@vercel/functions";
import { sendWhatsAppMessage } from "@/lib/whatsApp";
import Groq, { toFile } from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function transcreverAudioComGroq(
  audioSource: string,
  filename: string = "audio.ogg",
): Promise<string> {
  try {
    if (!audioSource) return "";

    let audioBuffer: Buffer;

    // Se for uma URL (ex: o mediaLink do Pilot Status)
    if (
      audioSource.startsWith("http://") ||
      audioSource.startsWith("https://")
    ) {
      const res = await fetch(audioSource);
      if (!res.ok) {
        throw new Error(
          `Falha ao baixar áudio da URL (HTTP ${res.status}: ${res.statusText})`,
        );
      }
      const arrayBuffer = await res.arrayBuffer();
      audioBuffer = Buffer.from(arrayBuffer);
    } else {
      // Limpa prefixos de Data URI caso seja base64
      const cleanBase64 = audioSource.includes(",")
        ? audioSource.split(",")[1]
        : audioSource;
      audioBuffer = Buffer.from(cleanBase64, "base64");
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      console.warn("[Groq] Buffer de áudio está vazio.");
      return "";
    }

    // Encapsula o buffer em um arquivo virtual em memória exigido pela Groq SDK
    const file = await toFile(audioBuffer, filename);

    const transcription = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3-turbo",
      language: "pt",
    });

    console.log(
      "[Groq] Transcrição realizada com sucesso:",
      transcription.text,
    );
    return transcription.text || "";
  } catch (err) {
    console.error("[Groq] Erro ao processar transcrição no Groq:", err);
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

  console.log(`[Agrupador] Enviando bloco para a IA: "${combinedMessageText}"`);

  try {
    let protocol = "https://";
    if (host.includes("localhost") || host.includes("127.0.0.1")) {
      protocol = "http://";
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `${protocol}${host}`;
    console.log(`[Agrupador] Chamando rota da IA: ${baseUrl}/api/schedule`);

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
    console.log("[Agrupador] Retorno da IA:", JSON.stringify(dataIA));

    const content = dataIA.ai_response || dataIA.message || dataIA.response;

    if (!content) {
      console.warn(
        "[Agrupador Alerta] Resposta da IA veio vazia ou em formato desconhecido.",
      );
      return;
    }

    const parts = Array.isArray(content) ? content : [content];

    for (const textPart of parts) {
      if (!textPart || !textPart.trim()) continue;

      console.log(
        `[Agrupador] Despachando mensagem para o WhatsApp (${clientPhone})...`,
      );

      await sendWhatsAppMessage(instanceName, clientPhone, textPart.trim());
    }
  } catch (err) {
    console.error("[Agrupador Exceção Crítica]:", err);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 1. Trava para ignorar mensagens de grupos (@g.us)
    const remoteJid = body.data?.key?.remoteJid || body.data?.from || "";
    const isGroup = body.data?.isGroup || remoteJid.includes("@g.us");

    if (isGroup) {
      return NextResponse.json({ ok: true, status: "group_ignored" });
    }

    // 2. Filtro de eventos válidos e ignorar mensagens enviadas por mim
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

    // 3. Obtenção da Instância / Número ID (Pilot Status usa data.numberId)
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

    // 4. Localização da Barbearia (Shop)
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
      console.warn(
        `[Webhook] Barbearia não encontrada para a instância/número: ${instanceName}`,
      );
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
      // Prioridade MÁXIMA para o `mediaLink` do Pilot Status (Webhook ao vivo)
      const audioSource =
        body.data?.mediaLink ||
        body.data?.media?.url ||
        body.data?.mediaUrl ||
        body.data?.url ||
        body.data?.base64;

      const mediaFilename = body.data?.mediaFilename || "voice.ogg";

      if (audioSource) {
        console.log(
          `[Webhook] Áudio recebido em tempo real de ${clientPhone} via Pilot Status (${audioSource}). Transcrevendo na Groq...`,
        );
        messageText = await transcreverAudioComGroq(audioSource, mediaFilename);
      } else {
        console.warn(
          "[Webhook Warning] Mensagem identificada como áudio, porém `mediaLink` veio nulo no payload do webhook.",
        );
        console.log(
          "[Webhook Payload Received]:",
          JSON.stringify(body, null, 2),
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
        "[Webhook] `content`/transcrição ficou vazia. Ignorando disparo da IA.",
      );
      return NextResponse.json({ ok: true, status: "empty-text" });
    }

    // 6. Salvar mensagem transcrita no banco de dados
    const currentMsg = await prisma.chatMessage.create({
      data: {
        role: "user",
        content: messageText.trim(),
        shopId: shop.id,
        clientPhone,
        processed: false,
      },
    });

    console.log(
      `[Webhook] Mensagem id #${currentMsg.id} criada com o texto: "${messageText}"`,
    );

    // 7. Disparar processamento da IA em segundo plano
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
