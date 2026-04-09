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
      console.log(
        "Condição de interrupção atingida. Evento não reconhecido ou fromMe.",
      );
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

    if (!messageText) return NextResponse.json({ ok: true });

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      `https://${request.headers.get("host")}`;

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
          text: dataIA.ai_response || dataIA.message || "Desculpe, tive um probleminha técnico. Pode repetir?",
          delay: 1000,
        }),
      },
    );

    return NextResponse.json({ status: "SUCCESS" });
  } catch (error) {
    console.error("Erro no Webhook WhatsApp:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
