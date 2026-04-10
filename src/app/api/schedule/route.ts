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

    const barbeiroNames = shopData.barbers.map((b) => b.name);
    const serviceNames = shopData.services.map((s) => s.name);
    const currentDate = getFormattedCurrentDate();

    const lastMessages = await prisma.chatMessage.findMany({
      where: { shopId: Number(shopId), clientPhone },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `Você é um assistente de agendamento de barbearia "${shopData.name}", profissional e amigável.
        Seu objetivo é guiar o usuário para preencher todos os campos da função 'scheduleAppointment'.
        ⚠️ INFORMAÇÃO CRÍTICA: A data de hoje é ${currentDate}. Assuma o ano atual.
        LISTA DE BARBEIROS: ${barbeiroNames.join(", ")}.
        LISTA DE SERVIÇOS: ${serviceNames.join(", ")}.
        Extraia: Nome do cliente, Barbeiro, Data, Hora e Serviço.
        O telefone (${clientPhone}) já é conhecido, não pergunte.`,
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
              clientName: { type: "string", description: "Nome do cliente." },
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
