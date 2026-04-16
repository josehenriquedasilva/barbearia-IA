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

    const openingTime = shopData.openingTime;
    const closingTime = shopData.closingTime;

    const dayOffInfo =
      shopData.hasDayOff && shopData.dayOff
        ? `Folga semanal toda ${shopData.dayOff}.`
        : "Não há folga semanal fixa.";

    const sundayInfo = shopData.isClosedSunday
      ? "Fechado aos Domingos."
      : `Aberto aos Domingos das ${shopData.openingSunday} às ${shopData.closingSunday}.`;

    const lunchInfo =
      shopData.hasLunchBreak && shopData.lunchStart && shopData.lunchEnd
        ? `Intervalo de almoço: ${shopData.lunchStart} às ${shopData.lunchEnd} (Não agendar neste período).`
        : "Não há intervalo de almoço.";

    const servicosInfo = shopData.services
      .map((s) => `- ${s.name}: ${s.durationMinutes} min`)
      .join("\n");

    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `Você é o assistente virtual da "${shopData.name}". Sua personalidade é profissional, AMIGÁVEL e muito direta.
        ${appointmentInfo}

        HOJE É: ${currentDate}.
    
        ATENÇÃO AO CALENDÁRIO:
        - Se hoje é ${currentDate.split(",")[0]}, amanhã será o dia seguinte na sequência. 
        - Verifique SEMPRE o dia da semana antes de dizer se a barbearia abre ou fecha.

        REGRAS DE FUNCIONAMENTO:
        - Horário Padrão (Seg-Sáb): ${openingTime} às ${closingTime}.
        - Domingo: ${sundayInfo}
        - Folga fixa: ${dayOffInfo}
        - - Domingos: ${sundayInfo}
        - ${lunchInfo}
    
        AGENDA DE HOJE (${currentDate}):
        ${busyScheduleString}

        SERVIÇOS E DURAÇÕES:
        ${servicosInfo}

        REGRA DE DURAÇÃO:
        - Ao sugerir horários, considere que o serviço leva o tempo listado acima.
        - Não agende nada que termine após o horário de fechamento (${closingTime}).

        REGRAS CRÍTICAS DE HORÁRIO:
        1. Verifique se o dia solicitado não é o dia de folga (${shopData.dayOff}) ou se é um Domingo fechado.
        2. NUNCA sugira horários que conflitem com a "AGENDA DE OCUPAÇÃO" ou com o intervalo de almoço.
        3. Se o cliente pedir um horário em que estamos fechados, informe o horário de funcionamento correto.
        4. Se o cliente pedir para "hoje" e o horário já passou do fechamento, ofereça o próximo dia útil.

        FLUXO DE ATENDIMENTO:
        1. SE FOR A PRIMEIRA MENSAGEM (saudação ou início de conversa): Dê as boas-vindas informando o nome da barbearia "${shopData.name}" e pergunte se o cliente deseja agendar um horário.
        2. SE O CLIENTE QUISER AGENDAR: Colete as informações que faltam uma por uma ou em grupos curtos, de forma natural.
        3. FINALIZAÇÃO: Quando tiver todos os dados (incluindo o nome), faça uma última confirmação: "Certo, [Serviço] com [Barbeiro] dia [Data] às [Hora]. Posso confirmar?". 
        4. SÓ chame a função após o "Sim" ou "Pode" do cliente.

        REGRAS DE COLETA (Siga esta ordem de prioridade):
        - BARBEIRO: ${unicoBarbeiro ? `Use "${unicoBarbeiro}" (único disponível). Não pergunte.` : `Barbeiros disponíveis: ${barbeiroNames.join(", ")}.`}
        - DATA: Se não informada, sugira hoje (${currentDate}).
        - HORA: Se não informada, sugira horários como 09:00, 10:30, 14:00 ou 16:30.
        - SERVIÇO: Opções: ${serviceNames.join(", ")}.
        - NOME DO CLIENTE: Peça o nome assim que o cliente escolher o serviço/horário. NÃO chame a função 'scheduleAppointment' se o campo 'clientName' estiver vazio.

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

      const dataAgendamento = new Date(`${args.date}T12:00:00Z`);
      const diaDaSemana = dataAgendamento.getUTCDay();

      if (diaDaSemana === 0 && shopData.isClosedSunday) {
        return NextResponse.json({
          status: "CLOSED_SUNDAY",
          ai_response:
            "Desculpe, mas não abrimos aos domingos. Poderia escolher outro dia?",
        });
      }

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

      if (shopData.hasDayOff && shopData.dayOff) {
        const diaFolgaNum = diasSemanaMap[shopData.dayOff.toLowerCase()];
        if (diaDaSemana === diaFolgaNum) {
          return NextResponse.json({
            status: "DAY_OFF",
            ai_response: `Às ${shopData.dayOff}s nós estamos fechados para descanso. Que tal outro dia?`,
          });
        }
      }

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

      const isSunday = diaDaSemana === 0;

      const currentOpening =
        isSunday && shopData.openingSunday
          ? shopData.openingSunday
          : shopData.openingTime;
      const currentClosing =
        isSunday && shopData.closingSunday
          ? shopData.closingSunday
          : shopData.closingTime;

      const [openH, openM] = currentOpening.split(":").map(Number);
      const [closeH, closeM] = currentClosing.split(":").map(Number);

      const openDate = new Date(startAt);
      openDate.setUTCHours(openH + USER_TIMEZONE_OFFSET_HOURS, openM, 0);

      const closeDate = new Date(startAt);
      closeDate.setUTCHours(closeH + USER_TIMEZONE_OFFSET_HOURS, closeM, 0);

      if (startAt < openDate || endTime > closeDate) {
        return NextResponse.json({
          status: "OUT_OF_HOURS",
          ai_response: `Desculpe, mas esse horário está fora do nosso expediente (${openingTime} às ${closingTime}). Pode escolher outro?`,
        });
      }

      if (shopData.hasLunchBreak && shopData.lunchStart && shopData.lunchEnd) {
        const [lStartH, lStartM] = shopData.lunchStart.split(":").map(Number);
        const [lEndH, lEndM] = shopData.lunchEnd.split(":").map(Number);

        const lunchStartDate = new Date(startAt);
        lunchStartDate.setUTCHours(
          lStartH + USER_TIMEZONE_OFFSET_HOURS,
          lStartM,
          0,
        );

        const lunchEndDate = new Date(startAt);
        lunchEndDate.setUTCHours(lEndH + USER_TIMEZONE_OFFSET_HOURS, lEndM, 0);

        if (startAt < lunchEndDate && endTime > lunchStartDate) {
          return NextResponse.json({
            status: "LUNCH_BREAK",
            ai_response: `Nesse horário nossos barbeiros estão em intervalo de almoço (${shopData.lunchStart} às ${shopData.lunchEnd}).`,
          });
        }
      }

      const existingAppointment = await prisma.appointment.findFirst({
        where: {
          barberId: targetBarber.id,
          status: "CONFIRMED",
          AND: [
            {
              startTime: { lt: endTime },
            },
            {
              endTime: { gt: startAt },
            },
          ],
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
