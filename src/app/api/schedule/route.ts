import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { startNewChat } from "@/lib/gemini";
import { ChatSession, Part, SchemaType, Tool } from "@google/generative-ai";
import { getAvailableSlotsForDay } from "@/utils/slots";

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
    const {
      message,
      shopId,
      clientPhone: rawClientPhone,
      currentMessageIds = [],
    } = await request.json();

    const clientPhone = rawClientPhone.replace(/^55/, "");

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
      const dateStr = upcomingAppointment.startTime.toLocaleDateString(
        "pt-BR",
        {
          timeZone: "America/Sao_Paulo",
        },
      );
      const timeStr = upcomingAppointment.startTime.toLocaleTimeString(
        "pt-BR",
        {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "America/Sao_Paulo",
        },
      );
      appointmentInfo = `\n- O cliente JÁ TEM um agendamento para o dia ${dateStr} às ${timeStr} (${upcomingAppointment.service.name} com ${upcomingAppointment.barber.name}).`;
    }

    const barbeiroNames = shopData.barbers.map((b) => b.name);
    const currentDate = getFormattedCurrentDate();
    const unicoBarbeiro = barbeiroNames.length === 1 ? barbeiroNames[0] : null;
    const unicoServico =
      shopData.services.length === 1 ? shopData.services[0].name : null;

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
            .map(
              (a) =>
                `- ${a.startTime.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} das ${a.startTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })} até às ${a.endTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })} com ${a.barber.name}`,
            )
            .join("\n")
        : "Nenhum horário ocupado nos próximos dias.";

    const servicosInfo = shopData.services
      .map((s) => `- ${s.name}: ${s.durationMinutes} min`)
      .join("\n");

    const listaResumida =
      shopData.services
        .slice(0, 3)
        .map((s) => s.name)
        .join(", ") + (shopData.services.length > 3 ? "..." : "");

    const lastMessages = await prisma.chatMessage.findMany({
      where: {
        shopId: Number(shopId),
        clientPhone,
        id: { notIn: currentMessageIds },
      },
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

    const systemInstruction = `Você é o assistente da "${shopData.name}".
${appointmentInfo}
Hoje: ${currentDate}.

DIRETRIZES:
  - Na primeira mensagem, faça uma saudação curta (ex: "Olá, bem-vindo à ${shopData.name}.") e pergunte para qual horário ele deseja agendar. 
  - NUNCA use frases genéricas de preenchimento como "Como posso ajudar?", "O que deseja?" ou "Em que posso ser útil?, EXCETO na situação de 'Agendamento Ativo', onde você deve perguntar como pode ajudar.".
  - Se o cliente mandou uma pergunta ou pedido junto com o "Oi", envie a saudação curta e, na mesma resposta, já responda à pergunta dele.
  - Se a conversa já estiver em andamento, NUNCA repita saudações ("Olá", "Tudo bem?", etc). Vá direto ao ponto.
  - Se o cliente aceitar uma sugestão sua: Responda apenas "Ok" antes de pedir os dados restantes.
  - Seja profissional, mas direto (máximo 2 frases). Separe por ponto final.
  - Intervalo obrigatório: 10 min entre atendimentos.
  - Primeiro horário pós-almoço: ${
    shopData.hasLunchBreak && shopData.lunchEnd
      ? (() => {
          const [h, m] = shopData.lunchEnd.split(":").map(Number);
          const total = h * 60 + m + 10;
          return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
        })()
      : "N/A"
  }.

SITUAÇÕES DE AGENDAMENTO:
  1. Agendamento Ativo: Se o cliente mandar apenas uma saudação, diga exatamente: "Olá! Vi que você já tem horário dia [DATA] às [HORA]. Como posso ajudar?". Se ele fizer uma pergunta ou pedido direto, ignore a saudação e responda à dúvida dele diretamente.
  2. Coleta de Dados: Olhe o histórico e peça APENAS o dado que está faltando (Nome ou Serviço). Se o cliente já falou o serviço, NUNCA repita o nome dele e nem mencione-o novamente; peça apenas o Nome.
  3. Confirmação de Horário: Se o cliente perguntar se determinado horário está disponível, responda (ex: "Este horário está livre") e siga pedindo os dados restantes.
  4. Ocupado/Almoço: "Temos horário disponível às [hora sugerida]. Pode ser?".
  5. Consulta de Horários: Sempre que o cliente quiser saber os horários ou sugerir um dia, use a ferramenta 'getAvailableSlots'. Mostre as opções e priorize sugerir os horários marcados como preferenciais (SIM), pois eles evitam buracos na agenda.

REGRAS GERAIS:
  - ${unicoServico ? `Serviço único: ${unicoServico}. Como a barbearia só possui este serviço, NUNCA mencione o nome dele nas respostas (ex: NÃO diga "com ${unicoServico}"), a menos que o cliente pergunte explicitamente.` : ""}
  - ${unicoBarbeiro ? `Barbeiro único: ${unicoBarbeiro}. Como a barbearia só possui este barbeiro, NUNCA mencione o nome dele nas respostas (ex: NÃO diga "com ${unicoBarbeiro}"), a menos que o cliente pergunte explicitamente.` : ""}
  - Funcionamento: Seg-Sáb ${shopData.openingTime}-${shopData.closingTime}. Dom: ${shopData.isClosedSunday ? "Fechado" : `${shopData.openingSunday}-${shopData.closingSunday}`}.
  - Almoço: ${shopData.hasLunchBreak ? `${shopData.lunchStart}-${shopData.lunchEnd}` : "Não possui intervalo de almoço"}.
  - Use nomes reais nas Tools (ex: "cabelo" -> "Corte").
  - Analise rigorosamente o histórico antes de responder para nunca pedir dados já fornecidos.

INFO ATUAL:
  Ocupação: ${busyScheduleString}
  Serviços: ${servicosInfo}
  Lista de serviços resumida: ${listaResumida}.`;

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
                  description: `Nome do barbeiro selecionado. Se houver apenas um (${unicoBarbeiro}), use '${unicoBarbeiro}' automaticamente.`,
                },
                date: {
                  type: SchemaType.STRING,
                  description: "Data no formato YYYY-MM-DD",
                },
                time: {
                  type: SchemaType.STRING,
                  description:
                    "Hora no formato HH:MM - O horário escolhido pelo usuário. Se o usuário aceitou uma sugestão de horário, use the horário sugerido.",
                },
                serviceName: {
                  type: SchemaType.STRING,
                  description: `O nome EXATO do serviço conforme a lista fornecida no sistema. Se houver apenas um (${unicoServico}), use '${unicoServico}' automaticamente.`,
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
            name: "getAvailableSlots",
            description:
              "Busca a grade completa de horários de um dia específico (livres, ocupados e recomendados) para o barbeiro e serviço escolhido.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                date: {
                  type: SchemaType.STRING,
                  description: "Data no formato YYYY-MM-DD",
                },
                barberName: {
                  type: SchemaType.STRING,
                  description: "Nome do barbeiro.",
                },
                serviceName: {
                  type: SchemaType.STRING,
                  description: "Nome do serviço desejado.",
                },
              },
              required: ["date", "barberName", "serviceName"],
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

      if (call.name === "getAvailableSlots") {
        const { date, barberName, serviceName } =
          call.args as unknown as CheckArgs;

        const targetBarber = shopData.barbers.find(
          (b) => b.name.toLowerCase() === barberName.toLowerCase(),
        );
        const targetService = shopData.services.find(
          (s) => s.name.toLowerCase() === serviceName.toLowerCase(),
        );

        if (!targetBarber || !targetService) {
          functionResponse = {
            error: true,
            message: "Barbeiro ou serviço inválido para essa loja.",
          };
        } else {
          const slotsGrid = await getAvailableSlotsForDay(
            Number(shopId),
            date,
            targetBarber.id,
            targetService.durationMinutes,
          );

          const slotsDisponiveis = slotsGrid.filter(
            (s) => s.status === "DISPONIVEL" || s.status === "RECOMENDADO",
          );

          functionResponse = {
            date,
            barberName,
            serviceName,
            grid: slotsDisponiveis.map((s) => ({
              horario: s.time,
              preferencial:
                s.status === "RECOMENDADO"
                  ? "SIM (Ofereça esse primeiro para o cliente)"
                  : "NÃO",
            })),
          };
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

        if (
          shopData.hasLunchBreak &&
          shopData.lunchStart &&
          shopData.lunchEnd
        ) {
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

            // Ajustado para o novo formato formal de almoço
            const ai_response = `Temos horário disponível às ${suggestTime}. Pode ser?`;

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

        const [openH, openM] = shopData.openingTime.split(":").map(Number);
        const [closeH, closeM] = shopData.closingTime.split(":").map(Number);
        const openingMinutes = openH * 60 + openM;
        const closingMinutes = closeH * 60 + closeM;

        const maxClosingMinutes = closingMinutes + 20;
        const appointmentEndMinutes =
          appointmentMinutes + targetService.durationMinutes;

        if (
          appointmentMinutes < openingMinutes ||
          appointmentEndMinutes > maxClosingMinutes
        ) {
          const maxCloseH = Math.floor(maxClosingMinutes / 60);
          const maxCloseM = maxClosingMinutes % 60;
          const maxCloseTimeStr = `${String(maxCloseH).padStart(2, "0")}:${String(maxCloseM).padStart(2, "0")}`;

          return NextResponse.json({
            status: "CLOSED",
            ai_response: `No momento estamos fechados nesse horário. Nosso expediente de atendimento vai até às ${shopData.closingTime}, permitindo serviços que finalizem até no máximo às ${maxCloseTimeStr}. Que tal escolher outro horário?`,
          });
        }

        const startAt = new Date(`${args.date}T${args.time}:00-03:00`);
        const startOfDay = new Date(`${args.date}T00:00:00-03:00`);

        const durationWithInterval = targetService.durationMinutes + 10;
        const endTime = new Date(
          startAt.getTime() + durationWithInterval * 60000,
        );

        try {
          const finalAppointment = await prisma.$transaction(async (tx) => {
            const existing = await tx.appointment.findFirst({
              where: {
                barberId: targetBarber.id,
                status: "CONFIRMED",
                NOT: { id: upcomingAppointment?.id },
                AND: [
                  { startTime: { lt: endTime } },
                  { endTime: { gt: startAt } },
                ],
              },
            });

            if (existing) {
              throw new Error("TIME_SLOT_TAKEN");
            }

            const lastBefore = await tx.appointment.findFirst({
              where: {
                barberId: targetBarber.id,
                status: "CONFIRMED",
                startTime: { lt: startAt, gte: startOfDay },
                NOT: { id: upcomingAppointment?.id },
              },
              orderBy: { endTime: "desc" },
            });

            const timeToStr = (d: Date) =>
              d.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "America/Sao_Paulo",
              });

            let isGap = false;
            let suggestedCloserTime = "";

            if (lastBefore) {
              const idealStartTime = new Date(lastBefore.endTime);
              const diffInMinutes =
                (startAt.getTime() - idealStartTime.getTime()) / 60000;

              if (diffInMinutes > 0 && diffInMinutes <= 45) {
                isGap = true;
                suggestedCloserTime = timeToStr(idealStartTime);
              }
            } else {
              const [openH, openM] = shopData.openingTime
                .split(":")
                .map(Number);
              const openingDate = new Date(startAt);
              openingDate.setHours(openH, openM, 0, 0);

              const diffFromOpening =
                (startAt.getTime() - openingDate.getTime()) / 60000;

              if (diffFromOpening > 10 && diffFromOpening <= 45) {
                isGap = true;
                suggestedCloserTime = shopData.openingTime;
              }
            }

            if (isGap) {
              const alreadySuggested = history.some(
                (msg) =>
                  msg.role === "model" &&
                  msg.parts.some(
                    (p) =>
                      typeof p.text === "string" &&
                      (p.text.includes("ajudar na agenda") ||
                        p.text.includes("horários disponíveis") ||
                        p.text.includes("Disponíveis:")),
                  ),
              );

              if (!alreadySuggested) {
                throw new Error(`GAP_DETECTED:${suggestedCloserTime}`);
              }
            }

            if (upcomingAppointment) {
              return await tx.appointment.update({
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
              return await tx.appointment.create({
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
          });

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
        } catch (txError: unknown) {
          const errorMessage = txError instanceof Error ? txError.message : "";

          if (errorMessage === "TIME_SLOT_TAKEN") {
            const existingCollision = await prisma.appointment.findFirst({
              where: {
                barberId: targetBarber.id,
                status: "CONFIRMED",
                NOT: { id: upcomingAppointment?.id },
                AND: [
                  { startTime: { lt: endTime } },
                  { endTime: { gt: startAt } },
                ],
              },
            });

            let suggestTime = existingCollision
              ? existingCollision.endTime.toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "America/Sao_Paulo",
                })
              : args.time;

            const clientTime =
              upcomingAppointment?.startTime.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "America/Sao_Paulo",
              });

            if (suggestTime === clientTime && upcomingAppointment) {
              const nextTick = new Date(
                upcomingAppointment.endTime.getTime() + 10 * 60000,
              );
              suggestTime = nextTick.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "America/Sao_Paulo",
              });
            }

            // Ajustado para o novo formato formal de Horário Ocupado
            const ai_response = `Temos horário disponível às ${suggestTime}. Pode ser?`;

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

          if (errorMessage.startsWith("GAP_DETECTED:")) {
            const closerTime = errorMessage.split(":")[1];

            // Ajustado para o novo formato formal de Otimização de Agenda/Gap
            const ai_response = `Temos horário disponível às ${closerTime}. Pode ser?`;

            await prisma.chatMessage.create({
              data: {
                role: "model",
                content: ai_response,
                shopId: Number(shopId),
                clientPhone,
              },
            });

            return NextResponse.json({
              status: "GAP_DETECTED",
              ai_response: ai_response,
            });
          }

          throw txError;
        }
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

    if (aiFinalText && aiFinalText.trim().length > 0) {
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
    } else {
      return NextResponse.json({
        status: "TEXT_RESPONSE",
        ai_response: ["Entendido! Posso ajudar em algo mais?"],
      });
    }
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
          "Repita sua última mensagem para eu tentar de novo.",
        ],
      });
    }

    return NextResponse.json(
      { status: "Error", message: (error as Error).message },
      { status: 500 },
    );
  }
}
