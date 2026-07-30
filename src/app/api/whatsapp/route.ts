import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { waitUntil } from "@vercel/functions";

const PILOT_STATUS_NATIVE_URL =
  process.env.PILOT_STATUS_NATIVE_URL || "https://pilotstatus.com.br";
const EVOLUTION_TENANT_KEY =
  process.env.EVOLUTION_TENANT_KEY ||
  process.env.PILOT_STATUS_API_KEY ||
  process.env.WHATSAPP_API_KEY;

/**
 * Função responsável pelo envio seguro de mensagens via Pilot Status
 */
export async function sendWhatsAppMessage(
  instanceName: string,
  number: string,
  text: string,
) {
  if (!PILOT_STATUS_NATIVE_URL || !EVOLUTION_TENANT_KEY || !instanceName) {
    console.error(
      "[WhatsApp Error] Parâmetros ou Variáveis de ambiente ausentes.",
      {
        rawBaseUrl: !!PILOT_STATUS_NATIVE_URL,
        apiKey: !!EVOLUTION_TENANT_KEY,
        instanceName,
      },
    );
    return null;
  }

  let baseUrl = PILOT_STATUS_NATIVE_URL.replace(/\/$/, "");
  if (!baseUrl.endsWith("/v1")) {
    baseUrl = `${baseUrl}/v1`;
  }

  const url = `${baseUrl}/messages/send`;

  // Garante o formato E.164 (+55...)
  const cleanDigits = number.replace(/\D/g, "");
  const numberWithDDI = cleanDigits.startsWith("55")
    ? cleanDigits
    : `55${cleanDigits}`;
  const finalNumber = `+${numberWithDDI}`;

  try {
    console.log(
      `[WhatsApp Send] Enviando mensagem para ${finalNumber} via numberId: ${instanceName}...`,
    );

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": EVOLUTION_TENANT_KEY,
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
    console.log("[WhatsApp Send Sucesso]:", data);
    return data;
  } catch (error) {
    console.error("[WhatsApp Send Exception]:", error);
    return null;
  }
}

async function transcreverAudioComGroq(
  messageId: string,
  instanceName: string,
): Promise<string> {
  try {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    let baseUrl = PILOT_STATUS_NATIVE_URL.replace(/\/$/, "");
    if (!baseUrl.endsWith("/v1")) {
      baseUrl = `${baseUrl}/v1`;
    }

    const responseMedia = await fetch(
      `${baseUrl}/chat/getBase64FromMediaMessage/${instanceName}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": EVOLUTION_TENANT_KEY as string,
          "x-whatsapp-number-id": instanceName,
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
      console.error("[Pilot Status Media Error]", errText);
      throw new Error("Não foi possível obter a mídia do Pilot Status");
    }

    const mediaData = await responseMedia.json();
    let base64String = mediaData.base64 || mediaData.response?.base64;

    if (!base64String) {
      console.error(
        "[Pilot Status Media Error] Base64 não encontrado na resposta.",
      );
      throw new Error("Base64 vazio");
    }

    if (base64String.includes(",")) {
      base64String = base64String.split(",")[1];
    }

    const audioBuffer = Buffer.from(base64String, "base64");
    const audioBlob = new Blob([audioBuffer], { type: "audio/ogg" });

    const formData = new FormData();
    formData.append("file", audioBlob, "audio.ogg");
    formData.append("model", "whisper-large-v3-turbo");
    formData.append("language", "pt");

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

  console.log(`[Agrupador] Enviando bloco para o Gemini.`);

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

      // Chamada corrigida usando a função sendWhatsAppMessage
      await sendWhatsAppMessage(instanceName, clientPhone, textPart.trim());
    }
  } catch (err) {
    console.error("[Agrupador Exceção Crítica]:", err);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 1. Suporte aos eventos do Pilot Status e Evolution
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

    // 2. Extrair o ID real do número / Instância (Pilot Status envia body.data.numberId)
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

    // Extrai o número destinatário (se existir) para auxiliar na busca
    const recipientPhone = (body.data?.to || "").replace(/\D/g, "");
    const cleanRecipient = recipientPhone.replace(/^55/, "");

    // 3. Buscar a barbearia correspondente no banco
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

    // 4. Extrair o telefone do cliente
    const rawClientPhone = body.data?.from || body.data?.key?.remoteJid || "";
    const clientPhone = rawClientPhone.replace(/\D/g, "").replace(/^55/, "");

    // 5. Extrair o texto da mensagem
    let messageText =
      body.data?.content ||
      body.data?.message?.conversation ||
      body.data?.message?.extendedTextMessage?.text ||
      "";

    const messageId = body.data?.messageId || body.data?.key?.id;
    const isAudio =
      body.data?.type === "audio" ||
      body.data?.messageType === "audioMessage" ||
      body.data?.message?.audioMessage;

    // IMPORTANTE: Para chamadas à API do Pilot Status, SEMPRE utilize o numberId real
    const effectiveInstance = instanceName || shop.whatsappInstance;

    // Transcrição de áudio via Groq caso seja áudio
    if (isAudio && messageId) {
      messageText = await transcreverAudioComGroq(messageId, effectiveInstance);
    }

    if (!messageText) {
      return NextResponse.json({ ok: true, status: "empty-text" });
    }

    // 6. Registra a mensagem no banco de dados
    const currentMsg = await prisma.chatMessage.create({
      data: {
        role: "user",
        content: messageText,
        shopId: shop.id,
        clientPhone,
        processed: false,
      },
    });

    // 7. Processamento assíncrono em background
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
