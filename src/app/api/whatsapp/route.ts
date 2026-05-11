import { NextResponse } from "next/server";
import prisma from "@/lib/db";

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

    const shop = await prisma?.shop.findUnique({
      where: { whatsappInstance: instanceName },
      select: { id: true, whatsappToken: true },
    });

    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const remoteJid = body.data.key.remoteJid;
    const clientPhone = remoteJid.split("@")[0];
    const messageText =
      body.data.message?.conversation ||
      body.data.message?.extendedTextMessage?.text ||
      "";

    console.log(`Chamando IA para o shop ${shop.id} no número ${clientPhone}`);

    if (!messageText) return NextResponse.json({ ok: true });

    const currentMsg = await prisma.chatMessage.create({
      data: {
        role: "user",
        content: messageText,
        shopId: shop.id,
        clientPhone,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 6000));

    const newerMsg = await prisma.chatMessage.findFirst({
      where: {
        shopId: shop.id,
        clientPhone,
        role: "user",
        id: { gt: currentMsg.id },
      },
    });

    if (newerMsg) {
      return NextResponse.json({
        status: "bundled",
        message: "Aguardando próxima mensagem...",
      });
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL;

    const aiResponse = await fetch(`${baseUrl}/api/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: messageText,
        shopId: shop.id,
        clientPhone: clientPhone,
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
              number: clientPhone,
              text: textPart.trim(),
              delay: 1200,
            }),
          },
        );
      }
    }

    return NextResponse.json({ status: "SUCCESS" });
  } catch (error) {
    console.error("Erro no Webhook WhatsApp:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
