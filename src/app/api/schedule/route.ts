import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { startNewChat } from "@/lib/gemini";
import { ChatSession, Part, SchemaType, Tool } from "@google/generative-ai";

export const dynamic = "force-dynamic";

interface ScheduleArgs {
  barberName: string;
  date: string;
  time: string;
  serviceName: string;
  clientName: string;
}

interface CheckArgs {
  barberName: string;
  date: string;
  time: string;
  serviceName: string;
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

async function sendMessageWithRetry(
  chat: ChatSession,
  content: string | (string | Part)[],
  maxRetries = 2,
) {
  let retryCount = 0;
  while (retryCount <= maxRetries) {
    try {
      return await chat.sendMessage(content);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "";
      const isOverloaded =
        errorMessage.includes("503") ||
        errorMessage.includes("429") ||
        errorMessage.includes("high demand");

      if (isOverloaded && retryCount < maxRetries) {
        retryCount++;
        console.log(
          `Gemini ocupado (503/429). Tentativa ${retryCount} de ${maxRetries}...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      throw error;
    }
  }
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
      appointmentInfo = `\n- O cliente JÁ TEM um agendamento para o dia ${dateStr} às ${timeStr} (${upcomingAppointment.service.name} com ${upcomingAppointment.barber.name}).`;
    }

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

    await prisma.chatMessage.createMany({
      data: {
        role: "user",
        content: message,
        shopId: Number(shopId),
        clientPhone,
      },
    });

    const lastMessages = await prisma.chatMessage.findMany({
      where: { shopId: Number(shopId), clientPhone },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const history = lastMessages.reverse().map((msg) => ({
      role: msg.role === "model" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    while (history.length > 0 && history[0].role === "model") {
      history.shift();
    }

    const systemInstruction = `Você é o assistente virtual da "${shopData.name}".
    ${appointmentInfo}
    HOJE: ${currentDate}.

    REGRAS DE INTERAÇÃO (IMPORTANTE):
    1. Se o cliente JÁ TEM um agendamento e enviou uma saudação genérica (ex: "Oi", "Bom dia"):
       - Responda: "Olá! Vi que você já tem um horário marcado para [DATA] às [HORA]. Como posso te ajudar hoje?"
    2. Se o cliente JÁ TEM um agendamento MAS fez uma pergunta específica (ex: "Tem vaga para amanhã?", "Quero desmarcar"):
       - NÃO use a frase "Como posso te ajudar". 
       - Reconheça o agendamento atual e responda à pergunta dele imediatamente.
       - Exemplo: "Olá! Vi que você já tem um horário dia 25/04 às 14h. Quer agendar outro para amanhã às 17h ou deseja remarcar o atual?"

    REGRAS DE OURO:
    - O intervalo de 10 minutos entre clientes e qualquer evento é OBRIGATÓRIO.
    ${unicoBarbeiro ? `- O ÚNICO barbeiro é ${unicoBarbeiro}. NÃO pergunte qual barbeiro o cliente deseja.` : ""}
    - Se o almoço termina às ${shopData.lunchEnd}, você PROIBE o horário das ${shopData.lunchEnd}. 
    - O primeiro horário disponível após o almoço é OBRIGATORIAMENTE ${(() => {
      const [h, m] = shopData.lunchEnd!.split(":").map(Number);
      const total = h * 60 + m + 10;
      return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    })()} .
    - NUNCA agende exatamente no horário de término do almoço.
    - Se o servidor recusar um horário (ex: almoço ou ocupado), lembre-se da sugestão dada e não pergunte novamente o que o cliente já respondeu.

    REGRAS DE DISPONIBILIDADE:
    1. Antes de verificar disponibilidade (checkAvailability), você precisa saber qual o serviço desejado para calcular o tempo de duração.
    2. NUNCA diga que um horário está livre sem antes chamar "checkAvailability".
    3. Se o cliente perguntar "está disponível às 14h?", use a tool "checkAvailability".
    4. Se a tool responder que está ocupado e sugerir um horário, diga: "As [hora pedida] está ocupado, mas consigo para as [hora sugerida]. Pode ser?"

    REGRAS DE CANCELAMENTO E REMARCAÇÃO:
    - Se o cliente quiser apenas CANCELAR ou DESMARCAR (sem pedir um novo horário), chame 'cancelAppointment'.
    - Se o cliente quiser REMARCAR ou MUDAR o horário, NÃO chame 'cancelAppointment'. 
    - Em caso de REMARCAÇÃO, verifique a disponibilidade do novo horário usando 'checkAvailability' e, se estiver livre, chame diretamente 'scheduleAppointment'. 
    - O sistema de agendamento já está preparado para atualizar o horário antigo automaticamente se um novo for enviado.

    COMPORTAMENTO:
    - Seja ultra-direto. Máximo 2 frases.
    - Se o horário pedido estiver ocupado ou for Almoço (${shopData.lunchStart}-${shopData.lunchEnd}), olhe a "OCUPAÇÃO ATUAL" e sugira o próximo horário vago imediatamente.
    - Considere sempre 10 minutos de intervalo entre os agendamentos.
    - SEPARE as informações por ponto final. 
    - Exemplo: "Vi que você já tem horário às 13h. O das 16h também está livre, quer remarcar?"

    REGRAS DE FUNCIONAMENTO:
    - Seg-Sáb: ${shopData.openingTime} às ${shopData.closingTime}.
    - Domingo: ${shopData.isClosedSunday ? "Fechado" : `Aberto ${shopData.openingSunday} às ${shopData.closingSunday}`}.
    - Almoço: ${shopData.hasLunchBreak ? `${shopData.lunchStart} às ${shopData.lunchEnd}` : "Sem intervalo"}.

    OCUPAÇÃO ATUAL (Não agende nestes horários):
    ${busyScheduleString}

    SERVIÇOS:
    ${servicosInfo}

    FLUXO: Saudação -> Coleta (Barbeiro: ${unicoBarbeiro || barbeiroNames.join(", ")}, Data, Hora, Serviço, Nome) -> Confirmação -> scheduleAppointment.

    1. Se faltar informações, peça-as. 
    2. Se só existe 1 barbeiro (${unicoBarbeiro}), ignore a escolha de barbeiro e não informe o nome do barbeiro (apenas se o cliente perguntar).
    3. Quando perguntar qual serviço, não liste os disponivel (apenas se o cliente perguntar).
    3. Se o cliente aceitar uma sugestão de horário, use ESSE horário imediatamente.
    4. Se já tiver Nome, Serviço, Barbeiro, Data e Hora, chame scheduleAppointment sem perguntar de novo.
    `;

    const tools: Tool[] = [
      {
        functionDeclarations: [
          {
            name: "scheduleAppointment",
            description:
              "Executa o agendamento após confirmação final do cliente.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                barberName: {
                  type: SchemaType.STRING,
                  description:
                    "Nome do barbeiro selecionado. Se houver apenas um (${unicoBarbeiro}), use '${unicoBarbeiro}' automaticamente.",
                },
                date: {
                  type: SchemaType.STRING,
                  description: "Data no formato YYYY-MM-DD",
                },
                time: {
                  type: SchemaType.STRING,
                  description:
                    "Hora no formato HH:MM - O horário escolhido pelo usuário. Se o usuário aceitou uma sugestão de horário, use o horário sugerido.",
                },
                serviceName: {
                  type: SchemaType.STRING,
                  description: "Nome do serviço selecionado",
                },
                clientName: {
                  type: SchemaType.STRING,
                  description: "Nome do cliente",
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
          {
            name: "cancelAppointment",
            description: "Cancela definitivamente o agendamento atual.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                confirm: {
                  type: SchemaType.BOOLEAN,
                },
              },
              required: ["confirm"],
            },
          },
          {
            name: "checkAvailability",
            description:
              "Verifica se um horário específico está disponível antes de sugerir ao cliente ou antes de tentar agendar.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                date: {
                  type: SchemaType.STRING,
                  description: "Data no formato YYYY-MM-DD",
                },
                time: {
                  type: SchemaType.STRING,
                  description: "Hora no formato HH:MM",
                },
                barberName: {
                  type: SchemaType.STRING,
                  description: "Nome do barbeiro",
                },
                serviceName: {
                  type: SchemaType.STRING,
                  description: "Nome do serviço",
                },
              },
              required: ["date", "time", "barberName", "serviceName"],
            },
          },
        ],
      },
    ];

    const chat = startNewChat(systemInstruction, tools, history);
    let result = await sendMessageWithRetry(chat, message);
    let responseAi = result!.response;
    let calls = responseAi.functionCalls();

    while (calls && calls.length > 0) {
      const call = calls[0];
      let functionResponse: Record<string, unknown> = {};

      if (call.name === "checkAvailability") {
        const { date, time, barberName, serviceName } =
          call.args as unknown as CheckArgs;
        const startAt = new Date(`${date}T${time}:00-03:00`);
        const targetBarber = shopData.barbers.find(
          (b) => b.name.toLowerCase() === barberName.toLowerCase(),
        );
        const targetService = shopData.services.find(
          (s) => s.name.toLowerCase() === serviceName.toLowerCase(),
        );

        if (!targetBarber || !targetService) {
          functionResponse = {
            available: false,
            message: "Barbeiro ou serviço não encontrado.",
          };
        } else {
          const totalDuration = targetService.durationMinutes + 10;
          const endAt = new Date(startAt.getTime() + totalDuration * 60000);

          const isBusy = await prisma.appointment.findFirst({
            where: {
              barberId: targetBarber.id,
              status: "CONFIRMED",
              NOT: { id: upcomingAppointment?.id },
              AND: [{ startTime: { lt: endAt } }, { endTime: { gt: startAt } }],
            },
          });

          if (isBusy) {
            const suggested = isBusy.endTime.toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "America/Sao_Paulo",
            });
            functionResponse = {
              available: false,
              message: `Ocupado. Sugira ${suggested}.`,
            };
          } else {
            functionResponse = { available: true, message: "Livre." };
          }
        }
      }

      if (call.name === "cancelAppointment") {
        if (!upcomingAppointment) {
          return NextResponse.json({
            status: "ERROR",
            ai_response: [
              "Você não tem agendamento ativo. quer marcar um horário?",
            ],
          });
        }
        await prisma.appointment.update({
          where: { id: upcomingAppointment.id },
          data: { status: "CANCELED" },
        });
        await prisma.chatMessage.deleteMany({
          where: { shopId: Number(shopId), clientPhone },
        });
        return NextResponse.json({
          status: "SUCCESS",
          ai_response: ["Agendamento cancelado com sucesso."],
        });
      }

      if (call.name === "scheduleAppointment") {
        const args = call.args as unknown as ScheduleArgs;

        if (!args.time || !args.date) {
          return NextResponse.json({
            status: "ERROR",
            ai_response: "Preciso da data e hora para agendar.",
          });
        }

        const [hour, minute] = args.time.split(":").map(Number);
        const appointmentMinutes = hour * 60 + minute;

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

        if (shopData.hasLunchBreak) {
          const [lStartH, lStartM] = shopData
            .lunchStart!.split(":")
            .map(Number);
          const [lEndH, lEndM] = shopData.lunchEnd!.split(":").map(Number);

          const lunchStartTotal = lStartH * 60 + lStartM;
          const lunchEndTotal = lEndH * 60 + lEndM;

          const firstSlotAfterLunch = lunchEndTotal + 10;

          if (
            appointmentMinutes >= lunchStartTotal &&
            appointmentMinutes < firstSlotAfterLunch
          ) {
            const suggestH = Math.floor(firstSlotAfterLunch / 60);
            const suggestM = firstSlotAfterLunch % 60;
            const suggestTime = `${String(suggestH).padStart(2, "0")}:${String(suggestM).padStart(2, "0")}`;

            const ai_response = `O horário das ${args.time} não está disponível O primeiro horário livre é às ${suggestTime}. Pode ser?`;

            await prisma.chatMessage.create({
              data: {
                role: "model",
                content: ai_response,
                shopId: Number(shopId),
                clientPhone,
              },
            });

            return NextResponse.json({
              status: "LUNCH_BREAK",
              ai_response: ai_response,
            });
          }
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

        const startAt = new Date(`${args.date}T${args.time}:00-03:00`);

        const durationWithInterval = targetService.durationMinutes + 10;
        const endTime = new Date(
          startAt.getTime() + durationWithInterval * 60000,
        );

        const existing = await prisma.appointment.findFirst({
          where: {
            barberId: targetBarber.id,
            status: "CONFIRMED",
            NOT: { id: upcomingAppointment?.id },
            AND: [{ startTime: { lt: endTime } }, { endTime: { gt: startAt } }],
          },
        });

        if (existing) {
          const suggestTime = existing.endTime.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/Sao_Paulo",
          });

          const ai_response = `O horário das ${args.time} já está ocupado com ${targetBarber.name}. O próximo horário disponível com ele é às ${suggestTime}. Pode ser?`;

          await prisma.chatMessage.create({
            data: {
              role: "model",
              content: ai_response,
              shopId: Number(shopId),
              clientPhone,
            },
          });

          return NextResponse.json({
            status: "UNAVAILABLE",
            ai_response: ai_response,
          });
        }

        let finalAppointment;

        if (upcomingAppointment) {
          finalAppointment = await prisma.appointment.update({
            where: { id: upcomingAppointment.id },
            data: {
              startTime: startAt,
              endTime: endTime,
              barberId: targetBarber.id,
              serviceId: targetService.id,
              status: "CONFIRMED",
            },
          });
        } else {
          finalAppointment = await prisma.appointment.create({
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
        }

        // Verificar se ao pedir para remarcar, ver se o sistema verifica se o horário pedido está ocupado

        await prisma.chatMessage.deleteMany({
          where: { shopId: Number(shopId), clientPhone },
        });

        const successMsg = upcomingAppointment
          ? "Certo. Seu horário foi alterado com sucesso!"
          : "Agendado com sucesso!";

        return NextResponse.json({
          status: "SUCCESS",
          ai_response: successMsg,
          details: finalAppointment,
        });
      }

      result = await sendMessageWithRetry(chat, [
        {
          functionResponse: {
            name: call.name,
            response: { content: functionResponse },
          },
        },
      ]);

      responseAi = result!.response;
      calls = responseAi.functionCalls();
    }

    const aiFinalText = responseAi.text();

    if (aiFinalText) {
      await prisma.chatMessage.create({
        data: {
          role: "model",
          content: aiFinalText,
          shopId: Number(shopId),
          clientPhone,
        },
      });

      const messagesToSend = aiFinalText
        .split(/(?<=[.!?])\s+/)
        .filter((msg: string) => msg.trim().length > 0);

      return NextResponse.json({
        status: "TEXT_RESPONSE",
        ai_response: messagesToSend,
      });
    }

    return NextResponse.json({
      status: "TEXT_RESPONSE",
      ai_response: aiFinalText,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Erro desconhecido";
    console.error("Erro no processamento", error);

    if (
      errorMessage.includes("503") ||
      errorMessage.includes("429") ||
      errorMessage.includes("high demand")
    ) {
      return NextResponse.json({
        status: "TEXT_RESPONSE",
        ai_response: [
          "Ops, tive um pequeno problema.",
          "Repita sua última mensagem para eu tentar de novo.Ou aguarde que iremos lhe responder em breve.",
        ],
      });
    }

    return NextResponse.json(
      { status: "Error", message: (error as Error).message },
      { status: 500 },
    );
  }
}
