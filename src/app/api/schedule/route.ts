import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
  apiVersion: "v1",
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
      appointmentInfo = `\n- O cliente JÁ TEM um agendamento para o dia ${dateStr} às ${timeStr} (${upcomingAppointment.service.name} com ${upcomingAppointment.barber.name}). Mencione brevemente.`;
    }

    const currentDate = getFormattedCurrentDate();

    const lastMessages = await prisma.chatMessage.findMany({
      where: { shopId: Number(shopId), clientPhone },
      orderBy: { createdAt: "desc" },
      take: 4,
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
        endTime: true,
        barber: { select: { name: true } },
      },
      orderBy: { startTime: "asc" },
    });

    const busyScheduleString =
      busyAppointments.length > 0
        ? busyAppointments
            .map((a) => {
              const start = a.startTime.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "UTC",
              });
              const endReal = a.endTime.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "UTC",
              });
              const proximaVaga = new Date(
                a.endTime.getTime() + 10 * 60000,
              ).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "UTC",
              });
              return `- ${a.barber.name}: Serviço das ${start} às ${endReal} (Livre após intervalo: ${proximaVaga})`;
            })
            .join("\n")
        : "Nenhum horário ocupado.";

    const scheduleMeetingFunctionDeclaration = {
      name: "scheduleAppointment",
      description: "Agenda o horário do cliente após confirmação final.",
      parameters: {
        type: Type.OBJECT, 
        properties: {
          barberName: { type: Type.STRING, description: "Nome do barbeiro" },
          date: { type: Type.STRING, description: "Data YYYY-MM-DD" },
          time: { type: Type.STRING, description: "Hora HH:MM" },
          serviceName: { type: Type.STRING, description: "Nome do serviço" },
          clientName: { type: Type.STRING, description: "Nome do cliente" },
        },
        required: ["barberName", "date", "time", "serviceName", "clientName"],
      },
    };

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        ...lastMessages.reverse().map((msg) => ({
          role: msg.role === "model" ? "model" : "user",
          parts: [{ text: msg.content }],
        })),
        { role: "user", parts: [{ text: message }] },
      ],
      config: {
        systemInstruction: `Você é o assistente virtual da "${shopData.name}". 
          ${appointmentInfo}
          HOJE É: ${currentDate}.
          Agenda: ${busyScheduleString}
          Seja breve (máx 15 palavras). Só agende após o cliente confirmar.`,
        tools: [
          {
            functionDeclarations: [scheduleMeetingFunctionDeclaration],
          },
        ],
      },
    });

    const aiText = response.text || "";
    const functionCall = response.functionCalls?.[0];

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

    if (functionCall && functionCall.name === "scheduleAppointment") {
      const args = functionCall.args as unknown as ScheduleArgs;
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
          ai_response: "Serviço ou barbeiro não encontrado.",
        });
      }

      const USER_TIMEZONE_OFFSET_HOURS = 3;
      const [hour, minute] = args.time.split(":").map(Number);
      const startAt = new Date(
        `${args.date}T${String(hour + USER_TIMEZONE_OFFSET_HOURS).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`,
      );
      const endTime = new Date(
        startAt.getTime() + targetService.durationMinutes * 60000,
      );

      const buffer = 10 * 60000;
      const existingAppointment = await prisma.appointment.findFirst({
        where: {
          barberId: targetBarber.id,
          status: "CONFIRMED",
          AND: [
            { startTime: { lt: new Date(endTime.getTime() + buffer) } },
            { endTime: { gt: new Date(startAt.getTime() - buffer) } },
          ],
        },
      });

      if (existingAppointment) {
        const sugerido = new Date(
          existingAppointment.endTime.getTime() + 10 * 60000,
        ).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "UTC",
        });
        return NextResponse.json({
          status: "UNAVAILABLE",
          ai_response: `O horário das ${args.time} está ocupado. O barbeiro ${targetBarber.name} libera às ${sugerido}. Pode ser?`,
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
        where: { shopId: Number(shopId), clientPhone },
      });

      return NextResponse.json({
        status: "SUCCESS",
        ai_response: `Perfeito! Agendado com sucesso: ${newAppointment.clientName} com ${newAppointment.barber.name} no dia ${args.date} às ${args.time}.`,
        details: newAppointment,
      });
    }

    return NextResponse.json({ status: "TEXT_RESPONSE", ai_response: aiText });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Erro desconhecido";
    console.error("Erro na rota Gemini:", errorMessage);
    return NextResponse.json(
      { status: "Error", message: errorMessage },
      { status: 500 },
    );
  }
}
