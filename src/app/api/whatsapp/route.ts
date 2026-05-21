import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { waitUntil } from "@vercel/functions";

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
    where: {
      shopId,
      clientPhone,
      role: "user",
      processed: false,
    },
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

    // 🔍 LOG 1: Mostra absolutamente tudo que a Evolution está enviando para nós
    console.log("=== [WEBHOOK EVOLUTION] NOVO PAYLOAD RECEBIDO ===");
    console.log(JSON.stringify(body, null, 2));
    console.log("=================================================");

    const rawEvent = body.event || "";
    const event = rawEvent.toUpperCase();
    const fromMe = body.data?.key?.fromMe;

    // ✨ ALTERAÇÃO: Liberado os eventos UPDATE, essenciais para receber áudios processados
    const isCorrectEvent =
      event === "MESSAGES.UPSERT" ||
      event === "MESSAGES_UPSERT" ||
      event === "MESSAGES.UPDATE" ||
      event === "MESSAGES_UPDATE";

    if (!isCorrectEvent || fromMe === true) {
      console.log(
        `[Webhook] Evento desconsiderado: ${event} | deMim: ${fromMe}`,
      );
      return NextResponse.json({ ok: true, status: "ignored" });
    }

    const instanceName = body.instance;
    const shop = await prisma.shop.findUnique({
      where: { whatsappInstance: instanceName },
    });

    if (!shop) {
      console.log(
        `[Webhook Error] Nenhuma barbearia vinculada com a instância: ${instanceName}`,
      );
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const remoteJid = body.data?.key?.remoteJid || body.data?.remoteJid;
    if (!remoteJid) {
      console.log("[Webhook] Ignorado: Falta o remoteJid.");
      return NextResponse.json({ ok: true, status: "no-remote-jid" });
    }

    const clientPhone = remoteJid.split("@")[0].replace(/^55/, "");

    // ✨ ALTERAÇÃO: Mapeia de forma agressiva onde a transcrição pode estar aninhada
    const messageText =
      body.data.message?.conversation ||
      body.data.message?.extendedTextMessage?.text ||
      body.data.transcription || // Transcrição direta (se configurado no upsert)
      body.data.update?.transcription || // Transcrição que vem dentro da atualização (MESSAGES_UPDATE)
      body.data.messageText ||
      "";

    console.log(`[Webhook] Texto extraído do payload: "${messageText}"`);

    if (!messageText) {
      console.log(
        "[Webhook] Ignorado: O evento entrou nas regras, mas não continha texto legível (pode ser o áudio em formato bruto, esperando transcrição).",
      );
      return NextResponse.json({ ok: true, status: "empty-text" });
    }

    console.log(
      `[Webhook] Sucesso! Salvando mensagem no banco: "${messageText}"`,
    );

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
    console.error("Erro Crítico no Webhook Principal:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
