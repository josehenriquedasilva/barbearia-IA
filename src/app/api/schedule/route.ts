import { NextResponse } from "next/server";
import { Type } from "@google/genai";
import prisma from "@/lib/db";
import { startNewChat } from "@/lib/gemini";

export const dynamic = "force-dynamic";

interface ScheduleArgs {
  barberName: string;
  date: string;
  time: string;
  serviceName: string;
  clientName: string;
}

function getFormattedCurrentDate() {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Sao_Paulo",
  };
  return new Date().toLocaleDateString("pt-BR", options);
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

    // 1. BUSCA DADOS DA BARBEARIA
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

    // 2. BUSCA AGENDAMENTOS EXISTENTES (PARA INFO DO SISTEMA)
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
      appointmentInfo = `\n- O cliente JÁ TEM um agendamento para o dia ${dateStr} às ${timeStr} (${upcomingAppointment.service.name} com ${upcomingAppointment.barber.name}).`;
    }

    // 3. PREPARA VARIÁVEIS DE CONTEXTO
    const barbeiroNames = shopData.barbers.map((b) => b.name);
    const currentDate = getFormattedCurrentDate();
    const unicoBarbeiro = barbeiroNames.length === 1 ? barbeiroNames[0] : null;

    const searchLimit = new Date();
    searchLimit.setDate(searchLimit.getDate() + 2);

    const busyAppointments = await prisma.appointment.findMany({
      where: {
        shopId: Number(shopId),
        startTime: { gte: new Date(), lte: searchLimit },
        status: "CONFIRMED",
      },
      select: { startTime: true, barber: { select: { name: true } } },
      orderBy: { startTime: "asc" },
    });

    const busyScheduleString =
      busyAppointments.length > 0
        ? busyAppointments
            .map(
              (a) =>
                `- ${a.startTime.toLocaleDateString("pt-BR")} às ${a.startTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} com ${a.barber.name}`,
            )
            .join("\n")
        : "Nenhum horário ocupado nos próximos dias.";

    const servicosInfo = shopData.services
      .map((s) => `- ${s.name}: ${s.durationMinutes} min`)
      .join("\n");

    // 4. HISTÓRICO E INSTRUÇÕES
    const lastMessages = await prisma.chatMessage.findMany({
      where: { shopId: Number(shopId), clientPhone },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const history = lastMessages.reverse().map((msg) => ({
      role: msg.role === "model" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    const systemInstruction = `Você é o assistente virtual da "${shopData.name}". Profissional e amigável.
    ${appointmentInfo}
    HOJE É: ${currentDate}.
    
    REGRAS DE FUNCIONAMENTO:
    - Seg-Sáb: ${shopData.openingTime} às ${shopData.closingTime}.
    - Domingo: ${shopData.isClosedSunday ? "Fechado" : `Aberto ${shopData.openingSunday} às ${shopData.closingSunday}`}.
    - Folga: ${shopData.hasDayOff ? shopData.dayOff : "Não há"}.
    - Almoço: ${shopData.hasLunchBreak ? `${shopData.lunchStart} às ${shopData.lunchEnd}` : "Sem intervalo"}.

    OCUPAÇÃO ATUAL:
    ${busyScheduleString}

    SERVIÇOS:
    ${servicosInfo}

    FLUXO: 
    1. Se for saudação, dê boas-vindas.
    2. Colete: Barbeiro (${unicoBarbeiro || barbeiroNames.join(", ")}), Data, Hora, Serviço e Nome do cliente.
    3. Antes de agendar, peça confirmação: "Certo, [Serviço] com [Barbeiro] dia [Data] às [Hora]. Posso confirmar?".
    4. SÓ chame a função 'scheduleAppointment' após o "Sim" ou "Pode".
    5. Respostas curtas (máx 2 frases).`;

    const tools = [
      {
        functionDeclarations: [
          {
            name: "scheduleAppointment",
            description:
              "Executa o agendamento após confirmação final do cliente.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                barberName: { type: Type.STRING },
                date: { type: Type.STRING, description: "YYYY-MM-DD" },
                time: { type: Type.STRING, description: "HH:MM" },
                serviceName: { type: Type.STRING },
                clientName: { type: Type.STRING },
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

    // 5. EXECUÇÃO DA IA
    const chat = startNewChat(systemInstruction, tools, history);
    const response = await chat.sendMessage({ message: message });

    const aiText = response.text || "";
    const call = response.functionCalls ? response.functionCalls[0] : null;

    // Salva a interação
    await prisma.chatMessage.createMany({
      data: [
        { role: "user", content: message, shopId: Number(shopId), clientPhone },
        {
          role: "model",
          content: aiText || "Chamada de função",
          shopId: Number(shopId),
          clientPhone,
        },
      ],
    });

    // 6. LÓGICA DE VALIDAÇÃO DA FUNÇÃO (BACKEND)
    if (call && call.name === "scheduleAppointment") {
      const args = call.args as unknown as ScheduleArgs;

      // Validação de Data/Folga/Domingo
      const dataAgendamento = new Date(`${args.date}T12:00:00Z`);
      const diaDaSemana = dataAgendamento.getUTCDay();
      const diasSemanaMap: Record<string, number> = {
        domingo: 0,
        "segunda-feira": 1,
        "terça-feira": 2,
        "quarta-feira": 3,
        "quinta-feira": 4,
        "sexta-feira": 5,
        sábado: 6,
        segunda: 1,
        terca: 2,
      };

      if (diaDaSemana === 0 && shopData.isClosedSunday) {
        return NextResponse.json({
          status: "CLOSED",
          ai_response: "Não abrimos aos domingos. Pode escolher outro dia?",
        });
      }

      if (
        shopData.hasDayOff &&
        shopData.dayOff &&
        diaDaSemana === diasSemanaMap[shopData.dayOff.toLowerCase()]
      ) {
        return NextResponse.json({
          status: "DAY_OFF",
          ai_response: `Estamos fechados às ${shopData.dayOff}s. Que tal outro dia?`,
        });
      }

      // Validação de Serviço e Barbeiro
      const targetService = shopData.services.find(
        (s) => s.name.toLowerCase() === args.serviceName.toLowerCase(),
      );
      const targetBarber = shopData.barbers.find(
        (b) => b.name.toLowerCase() === args.barberName.toLowerCase(),
      );

      if (!targetService || !targetBarber) {
        return NextResponse.json({
          status: "ERROR",
          ai_response: "Não encontrei o serviço ou barbeiro. Pode repetir?",
        });
      }

      // Cálculo de Horário e Conflitos
      const OFFSET = 3;
      const [hour, minute] = args.time.split(":").map(Number);
      const startAt = new Date(
        `${args.date}T${String(hour + OFFSET).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`,
      );
      const endTime = new Date(
        startAt.getTime() + targetService.durationMinutes * 60000,
      );

      // Verificação de Ocupação Real no Banco
      const existing = await prisma.appointment.findFirst({
        where: {
          barberId: targetBarber.id,
          status: "CONFIRMED",
          AND: [{ startTime: { lt: endTime } }, { endTime: { gt: startAt } }],
        },
      });

      if (existing) {
        return NextResponse.json({
          status: "UNAVAILABLE",
          ai_response: `O horário das ${args.time} já está ocupado com ${targetBarber.name}. Escolha outro?`,
        });
      }

      // 7. CRIAÇÃO DO AGENDAMENTO
      const newAppointment = await prisma.appointment.create({
        data: {
          clientName: args.clientName,
          clientPhone,
          shopId: shopData.id,
          barberId: targetBarber.id,
          serviceId: targetService.id,
          startTime: startAt,
          endTime: endTime,
        },
      });

      // Limpa histórico após sucesso
      await prisma.chatMessage.deleteMany({
        where: { shopId: Number(shopId), clientPhone },
      });

      return NextResponse.json({
        status: "SUCCESS",
        ai_response: `Perfeito! Agendado: ${args.serviceName} com ${args.barberName} dia ${args.date} às ${args.time}.`,
        details: newAppointment,
      });
    }

    return NextResponse.json({ status: "TEXT_RESPONSE", ai_response: aiText });
  } catch (error) {
    console.error("Erro:", error);
    return NextResponse.json(
      { status: "Error", message: (error as Error).message },
      { status: 500 },
    );
  }
}
