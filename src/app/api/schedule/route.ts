import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import OpenAI from "openai";
import {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/index.mjs";

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

export const dynamic = "force-dynamic";

interface ScheduleArgs {
  barberName: string;
  date: string;
  time: string;
  serviceName: string;
  clientName: string;
}

interface ClosedDay {
  date: string;
  reason: string;
}

function getFormattedCurrentDate() {
  const today = new Date();
  return today.toISOString().split("T")[0];
}

export async function POST(request: Request) {
  try {
    const { message, shopId, clientPhone } = await request.json();

    if (!shopId) {
      return NextResponse.json(
        { message: "ID da barbearia não fornecido." },
        { status: 400 },
      );
    }

    const shopData = await prisma.shop.findUnique({
      where: { id: Number(shopId) },
      include: {
        barbers: { select: { id: true, name: true } },
        services: { select: { id: true, name: true, durationMinutes: true } },
        closedDays: true,
      },
    });

    if (!shopData) {
      return NextResponse.json(
        { message: "Barbearia não encontrada." },
        { status: 404 },
      );
    }

    const upcomingAppointment = await prisma.appointment.findFirst({
      where: {
        clientPhone: clientPhone,
        shopId: Number(shopId),
        startTime: { gte: new Date() },
        status: "CONFIRMED",
      },
      include: { barber: true, service: true },
      orderBy: { startTime: "asc" },
    });

    let appointmentInfo = "";
    if (upcomingAppointment) {
      const dateStr = upcomingAppointment.startTime.toLocaleDateString("pt-BR");
      const timeStr = upcomingAppointment.startTime.toLocaleTimeString(
        "pt-BR",
        { hour: "2-digit", minute: "2-digit" },
      );
      appointmentInfo = `\n- O cliente JÁ TEM um agendamento para o dia ${dateStr} às ${timeStr} (${upcomingAppointment.service.name} com ${upcomingAppointment.barber.name}). Se ele saudar, mencione isso brevemente e pergunte em que pode ajudar.`;
    }

    const barbeiroNames = shopData.barbers.map((b) => b.name);
    const serviceNames = shopData.services.map((s) => s.name);
    const currentDate = getFormattedCurrentDate();
    const unicoBarbeiro = barbeiroNames.length === 1 ? barbeiroNames[0] : null;

    const lastMessages = await prisma.chatMessage.findMany({
      where: { shopId: Number(shopId), clientPhone },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const searchLimit = new Date();
    searchLimit.setDate(searchLimit.getDate() + 2);

    const busyAppointments = await prisma.appointment.findMany({
      where: {
        shopId: Number(shopId),
        startTime: { gte: new Date(), lte: searchLimit },
        status: "CONFIRMED",
      },
      select: {
        startTime: true,
        barber: { select: { name: true } },
      },
      orderBy: { startTime: "asc" },
    });

    const busyScheduleString =
      busyAppointments.length > 0
        ? busyAppointments
            .map((a) => {
              const d = a.startTime;
              return `- ${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} com ${a.barber.name}`;
            })
            .join("\n")
        : "Nenhum horário ocupado nos próximos dias.";

    const openingTime = "09:00";
    const closingTime = "19:00";
    const lunchBreak = "12:00 às 13:30";

    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `Você é o assistente virtual da "${shopData.name}". Sua personalidade é profissional, AMIGÁVEL e muito direta.
        ${appointmentInfo}

        HORÁRIO DE FUNCIONAMENTO:
        - Aberto de: ${openingTime} às ${closingTime}.
        - Intervalo: ${lunchBreak} (Não agendar neste período).
    
        AGENDA DE HOJE (${currentDate}):
        ${busyScheduleString}

        REGRAS DE HORÁRIO:
        1. Antes de sugerir um horário, verifique se ele está dentro do horário de funcionamento.
        2. NUNCA sugira ou confirme horários que já aparecem na "AGENDA DE HOJE" acima.
        3. Se o cliente pedir um horário ocupado, informe que está indisponível e sugira o próximo horário livre mais próximo.
        4. Se o cliente pedir para "hoje" e já passar das ${closingTime}, informe que encerramos e ofereça amanhã.

        FLUXO DE ATENDIMENTO:
        1. SE FOR A PRIMEIRA MENSAGEM (saudação ou início de conversa): Dê as boas-vindas informando o nome da barbearia "${shopData.name}" e pergunte se o cliente deseja agendar um horário.
        2. SE O CLIENTE QUISER AGENDAR: Colete as informações que faltam uma por uma ou em grupos curtos, de forma natural.
        3. FINALIZAÇÃO: Antes de chamar a função, faça uma confirmação rápida.

        REGRAS DE COLETA (Siga esta ordem de prioridade):
        - BARBEIRO: ${unicoBarbeiro ? `Use "${unicoBarbeiro}" (único disponível). Não pergunte.` : `Barbeiros disponíveis: ${barbeiroNames.join(", ")}.`}
        - DATA: Se não informada, sugira hoje (${currentDate}).
        - HORA: Se não informada, sugira horários como 09:00, 10:30, 14:00 ou 16:30.
        - SERVIÇO: Opções: ${serviceNames.join(", ")}.
        - NOME DO CLIENTE: Peça o nome apenas no final, antes da confirmação, caso ainda não saiba.

        ESTILO DE RESPOSTA:
        - Respostas curtas (máximo 2 frases).
        - Sem "Enthusiasm excessivo" ou textos robóticos.
        - Data de hoje: ${currentDate}.

        ⚠️ IMPORTANTE: Só use a função 'scheduleAppointment' após o cliente confirmar os dados finais (Ex: "Combinado, [Serviço] com [Barbeiro] às [Hora], pode ser?").`,
      },
      ...lastMessages.reverse().map((msg) => ({
        role: (msg.role === "model" ? "assistant" : "user") as
          | "assistant"
          | "user",
        content: msg.content,
      })),
      { role: "user", content: message },
    ];

    const tools: ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "scheduleAppointment",
          description:
            "Agenda o horário do cliente quando todos os dados estiverem confirmados.",
          parameters: {
            type: "object",
            properties: {
              barberName: {
                type: "string",
                description: "Nome do barbeiro da lista.",
              },
              date: { type: "string", description: "Data YYYY-MM-DD" },
              time: { type: "string", description: "Hora HH:MM" },
              serviceName: {
                type: "string",
                description: "Nome do serviço da lista.",
              },
              clientName: {
                type: "string",
                description:
                  "Nome do cliente. É obrigatório perguntar se ele não informou.",
              },
            },
            required: [
              "barberName",
              "date",
              "time",
              "serviceName",
              "clientName",
            ],
          },
        },
      },
    ];

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      tools,
      tool_choice: "auto",
    });

    const aiMessage = response.choices[0].message;
    const toolCall = aiMessage.tool_calls?.[0];

    await prisma.chatMessage.createMany({
      data: [
        { role: "user", content: message, shopId: Number(shopId), clientPhone },
        {
          role: "model",
          content: aiMessage.content || "Chamada de função",
          shopId: Number(shopId),
          clientPhone,
        },
      ],
    });

    if (
      toolCall &&
      "function" in toolCall &&
      toolCall.function.name === "scheduleAppointment"
    ) {
      const args = JSON.parse(toolCall.function.arguments) as ScheduleArgs;

      const closedDays = (shopData.closedDays as ClosedDay[]) || [];
      const closedDayEntry = closedDays.find((d) => d.date === args.date);

      if (closedDayEntry) {
        return NextResponse.json({
          status: "CLOSED",
          ai_response: `Desculpe, mas no dia ${args.date} a barbearia estará fechada (Motivo: ${closedDayEntry.reason || "não especificado"}). Pode escolher outro dia?`,
        });
      }

      const targetService = shopData.services.find(
        (s) => s.name.toLowerCase() === args.serviceName.toLowerCase(),
      );
      const targetBarber = shopData.barbers.find(
        (b) => b.name.toLowerCase() === args.barberName.toLowerCase(),
      );

      if (!targetService || !targetBarber) {
        return NextResponse.json({
          status: "ERROR",
          ai_response: `Desculpe, não encontrei o ${!targetService ? "serviço" : "barbeiro"} solicitado. Poderia confirmar os nomes disponíveis?`,
        });
      }

      const USER_TIMEZONE_OFFSET_HOURS = 3;
      const [hour, minute] = args.time.split(":").map(Number);
      const utcHour = hour + USER_TIMEZONE_OFFSET_HOURS;
      const startAt = new Date(
        `${args.date}T${String(utcHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`,
      );
      const endTime = new Date(
        startAt.getTime() + targetService.durationMinutes * 60000,
      );

      const existingAppointment = await prisma.appointment.findFirst({
        where: {
          barberId: targetBarber.id,
          startTime: startAt,
          status: "CONFIRMED",
        },
      });

      if (existingAppointment) {
        return NextResponse.json({
          status: "UNAVAILABLE",
          ai_response: `Poxa, o horário das ${args.time} com ${targetBarber.name} já está ocupado. Teria outro horário?`,
        });
      }

      const newAppointment = await prisma.appointment.create({
        data: {
          clientName: args.clientName,
          clientPhone: clientPhone,
          shopId: shopData.id,
          barberId: targetBarber.id,
          serviceId: targetService.id,
          startTime: startAt,
          endTime: endTime,
        },
        select: {
          id: true,
          clientName: true,
          startTime: true,
          endTime: true,
          barber: { select: { name: true } },
          service: { select: { name: true } },
        },
      });

      await prisma.chatMessage.deleteMany({
        where: {
          shopId: Number(shopId),
          clientPhone: clientPhone,
        },
      });

      return NextResponse.json({
        status: "SUCCESS",
        ai_response: `Perfeito! Agendado com sucesso: ${newAppointment.service.name} com ${newAppointment.barber.name} no dia ${args.date} às ${args.time}.`,
        details: newAppointment,
      });
    }

    return NextResponse.json({
      status: "TEXT_RESPONSE",
      ai_response: aiMessage.content,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Erro desconhecido";
    console.error("Erro na rota Groq:", errorMessage);
    return NextResponse.json(
      { status: "Error", message: errorMessage },
      { status: 500 },
    );
  }
}
