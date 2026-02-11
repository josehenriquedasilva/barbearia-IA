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
}

function getFormattedCurrentDate() {
  const today = new Date();
  return today.toISOString().split("T")[0];
}

export async function POST(request: Request) {
  try {
    const { message, history: incomingHistory } = await request.json();

    const currentDate = getFormattedCurrentDate();

    const availableBarbers = await prisma.barber.findMany({
      select: { id: true, name: true },
    });
    const availableServices = await prisma.service.findMany({
      select: {
        id: true,
        name: true,
        durationMinutes: true,
      },
    });

    if (availableBarbers.length === 0) {
      return NextResponse.json(
        { status: "Error", message: "Nenhum barbeiro cadastrado no sistema." },
        { status: 500 }
      );
    }

    const barbeiroNames = availableBarbers.map((b) => b.name);
    const serviceNames = availableServices.map((s) => s.name);

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
        ],
      },
    ];

    const systemInstruction = `
      Você é um assistente de agendamento de barbearia profissional e amigável.
      Seu objetivo é guiar o usuário para preencher todos os campos da função 'scheduleAppointment'.
      ⚠️ INFORMAÇÃO CRÍTICA: A data de hoje é ${currentDate}. Assuma o ano atual.

      LISTA DE BARBEIROS: ${barbeiroNames.join(", ")}.
      LISTA DE SERVIÇOS: ${serviceNames.join(", ")}.

      Você deve extrair o "nome do cliente", o "nome do barbeiro", "a data", "a hora" e "o serviço" da conversa.
      Se faltar algum dado OBRIGATÓRIO (nome do cliente, nome do barbeiro, data, hora ou serviço), você DEVE responder em texto perguntando o dado que falta.
      Se todos os dados OBRIGATÓRIOS estiverem na conversa, chame a função 'scheduleAppointment'.
    `;

    const chat = startNewChat(
      systemInstruction,
      tools,
      incomingHistory as Content[]
    );

    const response = await chat.sendMessage({ message: message });

    const newHistory = await chat.getHistory();

    const call = response.functionCalls ? response.functionCalls[0] : null;

    if (call && call.name === "scheduleAppointment") {
      const { barberName, date, time, serviceName, clientName } =
        call.args as unknown as ScheduleArgs;

      const clientPhone = "55999999999";

      const targetService = availableServices.find(
        (s) => serviceName && s.name.toLowerCase() === serviceName.toLowerCase()
      );

      if (!targetService) {
        return NextResponse.json(
          {
            status: "SERVICE_NOT_FOUND",
            ai_response: `Desculpe, o serviço "${serviceName}" não existe. Escolha um desta lista: ${serviceNames.join(
              ", "
            )}.`,
            newHistory: newHistory,
          },
          { status: 400 }
        );
      }

      const assumedDurationMinutes = targetService.durationMinutes;

      const targetBarber = availableBarbers.find(
        (b) => b.name.toLowerCase() === barberName.toLowerCase()
      );

      if (!targetBarber) {
        return NextResponse.json({
          status: "BARBER_NOT_FOUND",
          ai_response: `O barbeiro "${barberName}" não está na lista de disponíveis.`,
        });
      }

      const USER_TIMEZONE_OFFSET_HOURS = 3;

      const [hour, minute] = time.split(":").map(Number);

      const utcHour = hour + USER_TIMEZONE_OFFSET_HOURS;

      const utcTimeString = `${String(utcHour).padStart(2, "0")}:${minute
        .toString()
        .padStart(2, "0")}:00Z`;

      const startAt = new Date(`${date}T${utcTimeString}`);

      const endTime = new Date(
        startAt.getTime() + assumedDurationMinutes * 60000
      );

      const existingAppointment = await prisma.appointment.findFirst({
        where: {
          barberId: targetBarber.id,
          startTime: startAt,
        },
      });

      if (existingAppointment) {
        return NextResponse.json({
          status: "UNAVAILABLE",
          ai_response: `Desculpe, o horário com ${targetBarber.name} em ${date} às ${time} já está reservado. Por favor, escolha outro horário.`,
        });
      }

      const newAppointment = await prisma.appointment.create({
        data: {
          clientName: clientName || "Cliente padrão",
          clientPhone: clientPhone,
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
      { status: 500 }
    );
  }
}
