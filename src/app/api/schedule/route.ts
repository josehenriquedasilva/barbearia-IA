import { NextResponse } from "next/server";
import { startNewChat } from "@/lib/gemini";
import { Content, Type } from "@google/genai";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

interface ScheduleArgs {
  barberName: string;
  date: string;
  time: string;
  serviceName: string;
  clientName: string;
  clientPhone: string;
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
    const {
      message,
      history: incomingHistory,
      shopId,
      clientPhone,
    } = await request.json();

    if (!shopId) {
      return NextResponse.json(
        { message: "ID da barbearia não fornecido." },
        { status: 400 },
      );
    }

    const currentDate = getFormattedCurrentDate();

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

    const tools = [
      {
        functionDeclarations: [
          {
            name: "scheduleAppointment",
            description:
              "Agenda o horário do cliente. Deve ser chamada SOMENTE quando todas as informações necessárias (barbeiro, data, hora, e serviço) estiverem confirmadas. Use a lista de serviços fornecida.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                barberName: {
                  type: Type.STRING,
                  description:
                    "O nome completo do barbeiro escolhido pelo cliente (e que está na lista fornecida). Ex: Pedro.",
                },
                date: {
                  type: Type.STRING,
                  description:
                    "A data do agendamento no formato YYYY-MM-DD. Ex: 2025-12-25.",
                },
                time: {
                  type: Type.STRING,
                  description:
                    "O horário do agendamento no formato HH:MM (24 horas). Ex: 10:00.",
                },
                serviceName: {
                  type: Type.STRING,
                  description: "O nome do serviço escolhido. Obrigatorio.",
                },
                clientName: {
                  type: Type.STRING,
                  description: "O nome do cliente. Obrigatorio.",
                },
                clientPhone: {
                  type: Type.STRING,
                  description: "O número de telefone do cliente.",
                },
              },
              required: [
                "barberName",
                "date",
                "time",
                "serviceName",
                "clientName",
                "clientPhone",
              ],
            },
          },
        ],
      },
    ];

    const systemInstruction = `
      Você é um assistente de agendamento de barbearia "${shopData.name}", profissional e amigável.
      Seu objetivo é guiar o usuário para preencher todos os campos da função 'scheduleAppointment'.
      ⚠️ INFORMAÇÃO CRÍTICA: A data de hoje é ${currentDate}. Assuma o ano atual.

      LISTA DE BARBEIROS: ${barbeiroNames.join(", ")}.
      LISTA DE SERVIÇOS: ${serviceNames.join(", ")}.

      Você deve extrair o "nome do cliente", "telefone do cliente", "nome do barbeiro", "a data", "a hora" e "o serviço" da conversa.
      Se faltar algum dado OBRIGATÓRIO (nome do cliente, telefone do cliente, nome do barbeiro, data, hora ou serviço), você DEVE responder em texto perguntando o dado que falta.
      Se todos os dados OBRIGATÓRIOS estiverem na conversa, chame a função 'scheduleAppointment'.
    `;

    const chat = startNewChat(
      systemInstruction,
      tools,
      incomingHistory as Content[],
    );

    const response = await chat.sendMessage({ message: message });

    const newHistory = await chat.getHistory();

    const call = response.functionCalls ? response.functionCalls[0] : null;

    if (call && call.name === "scheduleAppointment") {
      const args = call.args as unknown as ScheduleArgs;
      const closedDays = (shopData.closedDays as ClosedDay[]) || [];
      const closedDayEntry = closedDays.find((d) => d.date === args.date);

      if (closedDayEntry) {
        const reason = closedDayEntry.reason || "não especificado";
        return NextResponse.json({
          status: "CLOSED",
          ai_response: `Desculpe, mas no dia ${args.date} a barbearia estará fechada (Motivo: ${reason}). Pode escolher outro dia?`,
          newHistory,
        });
      }

      const targetService = shopData.services.find(
        (s) => s.name.toLowerCase() === args.serviceName.toLowerCase(),
      );
      const targetBarber = shopData.barbers.find(
        (b) => b.name.toLowerCase() === args.barberName.toLowerCase(),
      );

      if (!targetService) {
        return NextResponse.json(
          {
            status: "SERVICE_NOT_FOUND",
            ai_response: `Desculpe, o serviço "${args.serviceName}" não existe. Escolha um desta lista: ${serviceNames.join(
              ", ",
            )}.`,
            newHistory: newHistory,
          },
          { status: 400 },
        );
      }

      if (!targetBarber) {
        return NextResponse.json(
          {
            status: "BARBER_NOT_FOUND",
            ai_response: `Desculpe, o barbeiro "${args.barberName}" não está na lista de disponíveis. Escolha um desta lista: ${barbeiroNames.join(
              ", ",
            )}.`,
            newHistory: newHistory,
          },
          { status: 400 },
        );
      }

      const assumedDurationMinutes = targetService.durationMinutes;

      const USER_TIMEZONE_OFFSET_HOURS = 3;

      const [hour, minute] = args.time.split(":").map(Number);

      const utcHour = hour + USER_TIMEZONE_OFFSET_HOURS;

      const utcTimeString = `${String(utcHour).padStart(2, "0")}:${minute
        .toString()
        .padStart(2, "0")}:00Z`;

      const startAt = new Date(`${args.date}T${utcTimeString}`);

      const endTime = new Date(
        startAt.getTime() + assumedDurationMinutes * 60000,
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
          ai_response: `Poxa, o horário das ${args.time} com ${targetBarber.name} já foi preenchido. Tem outro horário ou barbeiro de sua preferência?`,
          newHistory,
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
        message: "Agendamento realizado com sucesso!",
        details: newAppointment,
        newHistory: newHistory,
      });
    }

    return NextResponse.json({
      status: "TEXT_RESPONSE",
      message: "IA respondeu em texto (aguardando mais dados).",
      ai_response: response.text,
      newHistory: newHistory,
    });
  } catch (error) {
    console.error("Erro na rota de agendamento:", error);
    return NextResponse.json(
      { status: "Error", message: (error as Error).message },
      { status: 500 },
    );
  }
}
