import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { waitUntil } from "@vercel/functions"; // 👈 Essencial para rodar na Vercel

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
  // Aguarda 2.5 segundos para agrupar mensagens consecutivas do cliente
  await new Promise((resolve) => setTimeout(resolve, 2500));

  const newerMsg = await prisma.chatMessage.findFirst({
    where: {
      shopId,
      clientPhone,
      role: "user",
      id: { gt: currentMsgId },
    },
  });

  if (newerMsg) {
    console.log(
      `[Agrupador] Mensagem ${currentMsgId} ignorada, há uma mais recente.`,
    );
    return;
  }

  const lastModelMsg = await prisma.chatMessage.findFirst({
    where: { shopId, clientPhone, role: "model" },
    orderBy: { id: "desc" },
  });

  const unreadUserMessages = await prisma.chatMessage.findMany({
    where: {
      shopId,
      clientPhone,
      role: "user",
      id: lastModelMsg ? { gt: lastModelMsg.id } : undefined,
    },
    orderBy: { id: "asc" },
  });

  if (unreadUserMessages.length === 0) return;

  const combinedMessageText = unreadUserMessages
    .map((m) => m.content.trim())
    .join("\n");

  console.log(
    `[Agrupador] Enviando ${unreadUserMessages.length} mensagens combinadas para o Gemini.`,
  );

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
      select: { id: true, whatsappToken: true },
    });

    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const remoteJid = body.data.key.remoteJid;
    const rawPhone = remoteJid.split("@")[0];
    const clientPhone = rawPhone.replace(/^55/, "");

    const messageText =
      body.data.message?.conversation ||
      body.data.message?.extendedTextMessage?.text ||
      "";

    if (!messageText) return NextResponse.json({ ok: true });

    const currentMsg = await prisma.chatMessage.create({
      data: {
        role: "user",
        content: messageText,
        shopId: shop.id,
        clientPhone,
      },
    });

    // 🔥 O SEGREDO PARA A VERCEL ESTÁ AQUI:
    // O 'waitUntil' segura o ciclo de vida do servidor rodando em background
    // mesmo após enviarmos o return logo abaixo.
    waitUntil(
      processBackgroundAi({
        currentMsgId: currentMsg.id,
        shopId: shop.id,
        clientPhone,
        instanceName,
        host: request.headers.get("host") || "",
      }).catch((err) =>
        console.error("Erro no processamento em background:", err),
      ),
    );

    // Resposta imediata para a Evolution API/WhatsApp parar de tentar reenviar a mensagem
    return NextResponse.json({
      status: "processing",
      message: "Recebido com sucesso!",
    });
  } catch (error) {
    console.error("Erro no Webhook WhatsApp:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
