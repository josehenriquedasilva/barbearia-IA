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
  // 1. Aumentamos para 4 segundos para garantir uma janela segura de digitação consecutiva
  await new Promise((resolve) => setTimeout(resolve, 4000));

  // 2. Busca a ÚLTIMA mensagem enviada por esse usuário específico no banco
  const latestUserMsg = await prisma.chatMessage.findFirst({
    where: {
      shopId,
      clientPhone,
      role: "user",
    },
    orderBy: {
      id: "desc", // Pega a mensagem mais recente de todas
    },
  });

  // SE a mensagem mais recente do banco NÃO FOR a mensagem atual deste processo,
  // significa que o usuário enviou outra mensagem depois. Esse processo antigo morre aqui.
  if (!latestUserMsg || latestUserMsg.id !== currentMsgId) {
    console.log(
      `[Agrupador] Ignorando mensagem antiga ${currentMsgId}. O usuário já mandou outra mais nova.`,
    );
    return;
  }

  // 3. Se passou pelo IF, ESTE processo é oficialmente o da ÚLTIMA MENSAGEM DO BLOCO!
  // Vamos buscar a última vez que a IA respondeu para este cliente
  const lastModelMsg = await prisma.chatMessage.findFirst({
    where: { shopId, clientPhone, role: "model" },
    orderBy: { id: "desc" },
  });

  // 4. Pega todas as mensagens que o usuário enviou desde a última resposta da IA
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

  // 5. Junta todas as mensagens em um único texto separado por quebra de linha
  const combinedMessageText = unreadUserMessages
    .map((m) => m.content.trim())
    .join("\n");

  console.log(
    `[Agrupador] Disparando requisição ÚNICA para o Gemini com ${unreadUserMessages.length} mensagens agrupadas.`,
  );

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `https://${host}`;

  // Envia o bloco unificado para a API do schedule
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

    // Salva a mensagem recebida imediatamente no banco de dados
    const currentMsg = await prisma.chatMessage.create({
      data: {
        role: "user",
        content: messageText,
        shopId: shop.id,
        clientPhone,
      },
    });

    // Passa o controle para a Vercel gerenciar em segundo plano
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

    // Resposta imediata de sucesso para a Evolution API não reenviar o mesmo webhook
    return NextResponse.json({
      status: "processing",
      message: "Mensagem recebida!",
    });
  } catch (error) {
    console.error("Erro no Webhook WhatsApp:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
