import { NextResponse } from "next/server";

import prisma from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    console.log("--- REQUISIÇÃO RECEBIDA NO WEBHOOK ---");

    // Log para você ver o que está chegando da Evolution no seu terminal

    console.log("Corpo recebido:", JSON.stringify(body, null, 2));

    const rawEvent = body.event || "";

    const event = rawEvent.toUpperCase();

    const fromMe = body.data?.key?.fromMe;

    console.log("Validando -> Evento:", event, "| FromMe:", fromMe);

    // Aceita tanto MESSAGES.UPSERT quanto MESSAGES_UPSERT
    const isCorrectEvent =
      event === "MESSAGES.UPSERT" || event === "MESSAGES_UPSERT";

    if (!isCorrectEvent || fromMe === true) {
      console.log(
        "Condição de interrupção atingida. Evento não reconhecido ou fromMe.",
      );
      return NextResponse.json({ ok: true, status: "ignored" });
    }

    console.log("Passou na validação! Buscando shop...");

    const instanceName = body.instance;

    // Busca o Shop

    const shop = await prisma.shop.findUnique({
      where: { whatsappInstance: instanceName },
    });

    if (!shop) {
      console.log("Erro: Shop não encontrado para instância", instanceName);

      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const remoteJid = body.data?.key?.remoteJid;

    const clientPhone = remoteJid?.split("@")[0];

    const messageText =
      body.data?.message?.conversation ||
      body.data?.message?.extendedTextMessage?.text ||
      "";

    console.log(`Enviando para IA: Phone: ${clientPhone}, ShopId: ${shop.id}`);

    // Chamada para a sua API de agendamento

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      `https://${request.headers.get("host")}`;

    const aiResponse = await fetch(`${baseUrl}/api/schedule`, {
      method: "POST",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({
        message: messageText,

        shopId: shop.id,

        clientPhone: String(clientPhone),
      }),
    });

    const dataIA = await aiResponse.json();

    console.log("Resposta da IA:", dataIA.ai_response);

    // Envia de volta para o WhatsApp via Evolution

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

          text: dataIA.ai_response || dataIA.message,
        }),
      },
    );

    return NextResponse.json({ status: "SUCCESS" });
  } catch (error) {
    console.error("ERRO NO WEBHOOK:", error);

    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
