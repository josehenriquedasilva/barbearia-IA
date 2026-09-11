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

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
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

    if (!shopId) {
      return NextResponse.json(
        { message: "ID da barbearia não fornecido." },
        { status: 400 },
      );
    }

    const clientPhone = rawClientPhone ? rawClientPhone.replace(/^55/, "") : "";

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

    // Busca agendamento futuro ativo do cliente
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
        { timeZone: "America/Sao_Paulo" },
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

    // Busca grade ocupada dos próximos 2 dias para context da IA
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

    // Histórico de mensagens
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
  - Na primeira mensagem da conversa, faça uma saudação curta (ex: "Olá, bem-vindo à ${shopData.name}.") integrada com a resposta ao cliente.
  - NUNCA use frases genéricas de preenchimento como "Como posso ajudar?", "O que deseja?" ou "Em que posso ser útil?", EXCETO na situação de 'Agendamento Ativo', onde você deve perguntar como pode ajudar.
  - Se o cliente mandou uma pergunta ou pedido junto com o "Oi", envie a saudação curta e, na mesma resposta, já responda à pergunta dele.
  - Se a conversa já estiver em andamento, NUNCA repita saudações ("Olá", "Tudo bem?", etc). Vá direto ao ponto.
  - Se o cliente aceitar uma sugestão sua: Responda apenas "Ok" antes de pedir os dados restantes.
  - Seja profissional, mas direto (máximo 2 frases). Separe por ponto final.
  - Intervalo obrigatório: 10 min entre atendimentos.
  - Retorno do almoço: ${shopData.hasLunchBreak && shopData.lunchEnd ? shopData.lunchEnd : "N/A"}.

SITUAÇÕES DE AGENDAMENTO:
  1. Agendamento Ativo: Se o cliente mandar apenas uma saudação, diga exatamente: "Olá! Vi que você já tem horário dia [DATA] às [HORA]. Como posso ajudar?". Se ele fizer uma pergunta ou pedido direto, ignore a saudação e responda à dúvida dele diretamente.
  2. Coleta do Serviço PRIMEIRO:
     - Para calcular a disponibilidade de horários (seja para um dia ou para um horário específico), você PRECISA saber qual o serviço desejado.
     - Se o cliente perguntar se tem vaga em determinado dia ou horário (ex: "Tem horário amanhã?", "Tem horário às 14h?") e AINDA NÃO tiver informado o serviço, pergunte PRIMEIRO qual serviço ele deseja realizar (a menos que a loja só tenha 1 serviço).
  3. Confirmação e Consulta de Horários:
     - Sempre que tiver o serviço definido e o cliente perguntar sobre disponibilidade (geral ou de horário específico), acione a ferramenta 'getAvailableSlots'.
     - Se o cliente perguntar se um horário específico está livre (ex: "Tem às 14h?"):
       * Se estiver LIVRE/RECOMENDADO no grid: Confirme para o cliente e peça o Nome dele.
       * Se NÃO estiver livre ou for ocupado: Ofereça APENAS os horários LIVRES/RECOMENDADOS que sejam os MAIS PRÓXIMOS (imediatamente antes ou depois) do horário que ele pediu. NUNCA dê saltos grandes de horário (ex: pular da manhã para a tarde), a menos que não haja nenhuma outra vaga no mesmo turno.
  4. Ocupado/Almoço: Se sugerir apenas UM horário alternativo, use: "Temos horário disponível às [hora sugerida]. Pode ser?". Se você listar ou sugerir MAIS DE UM horário alternativo, termine obrigatoriamente com "Qual prefere?".
  5. Retorno do 'getAvailableSlots':
   - SE O RETORNO INDICAR 'isClosed: true': Informe educadamente ao cliente o motivo ('reason') e pergunte se ele deseja verificar outro dia.
   - SE HOUVER HORÁRIOS LIVRES (isClosed: false e grid com horários): NÃO liste todos os horários disponíveis. Apenas confirme que SIM, existem horários livres para aquele dia e peça para o cliente informar o horário que ele deseja.
   - SE A GRADE ESTIVER VAZIA (isClosed: false e grid vazio): Informe que os horários para este dia já estão todos lotados/preenchidos e pergunte se pode ser em outro dia.

REGRAS GERAIS:
  - REGRA DE PROXIMIDADE DE HORÁRIOS: Ao sugerir alternativas de horário para o cliente, selecione SEMPRE os horários livres mais próximos do horário originalmente solicitado por ele. Priorize horários no mesmo turno (manhã com manhã, tarde com tarde).
  - REGRA DE PERGUNTA AO SUGERIR: Quando você sugerir horários específicos por conta própria (ex: em caso de conflito ou após o cliente pedir uma lista), se contiver apenas 1 horário, termine com "Pode ser?". Se contiver 2 ou mais horários, termine com "Qual prefere?".
  - ${unicoServico ? `Serviço único: ${unicoServico}. Como a barbearia só possui este serviço, NUNCA pergunte qual serviço o cliente deseja e NUNCA mencione o nome dele nas respostas, a menos que o cliente pergunte explicitamente.` : ""}
  - ${unicoBarbeiro ? `Barbeiro único: ${unicoBarbeiro}. Como a barbearia só possui este barbeiro, NUNCA mencione o nome dele nas respostas, a menos que o cliente pergunte explicitamente.` : ""}
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
                    "Hora no formato HH:MM - O horário escolhido pelo usuário. Se o usuário aceitou uma sugestão de horário, use o horário sugerido.",
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
              "Busca a grade completa de horários de um dia específico (livres e recomendados) para o barbeiro e serviço escolhido.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                date: {
                  type: SchemaType.STRING,
                  description: "Data no formato YYYY-MM-DD",
                },
                barberName: {
                  type: SchemaType.STRING,
                  description: `Nome do barbeiro. Se houver apenas um (${unicoBarbeiro}), use '${unicoBarbeiro}' automaticamente.`,
                },
                serviceName: {
                  type: SchemaType.STRING,
                  description: `Nome do serviço desejado. Se houver apenas um (${unicoServico}), use '${unicoServico}' automaticamente.`,
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
          const slotsResult = await getAvailableSlotsForDay(
            Number(shopId),
            date,
            targetBarber.id,
            targetService.durationMinutes,
          );

          if (slotsResult.isClosed) {
            functionResponse = {
              isClosed: true,
              reason: slotsResult.closedReason,
              message: slotsResult.closedReason,
            };
          } else {
            functionResponse = {
              isClosed: false,
              date,
              barberName,
              serviceName,
              totalSlots: slotsResult.slots.length,
              grid: slotsResult.slots.map((s) => ({
                horario: s.time,
                status: s.status,
                preferencial:
                  s.status === "RECOMENDADO"
                    ? "SIM (Ofereça preferencialmente se for o mais próximo do pedido do cliente)"
                    : "NÃO",
              })),
            };
          }
        }
      }

      if (call.name === "cancelAppointment") {
        if (!upcomingAppointment) {
          return NextResponse.json({
            status: "ERROR",
            ai_response: [
              "Você não tem agendamento ativo. Quer marcar um horário?",
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
            ai_response: ["Preciso da data e hora para agendar."],
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
            ai_response: ["Não encontrei o serviço ou barbeiro. Pode repetir?"],
          });
        }

        // 1. VALIDAÇÃO CENTRALIZADA VIA slots.ts
        const slotsResult = await getAvailableSlotsForDay(
          Number(shopId),
          args.date,
          targetBarber.id,
          targetService.durationMinutes,
        );

        if (slotsResult.isClosed) {
          return NextResponse.json({
            status: "CLOSED",
            ai_response: [
              slotsResult.closedReason ||
                "A barbearia estará fechada nesta data.",
            ],
          });
        }

        // Verifica se o horário escolhido pelo cliente é válido no grid do slots.ts
        const chosenSlot = slotsResult.slots.find((s) => s.time === args.time);

        if (!chosenSlot) {
          // O horário escolhido é inválido (ocupado, almoço, fora de expediente ou gera lacuna proibida)
          // Busca o horário alternativo mais próximo da escolha do cliente
          const recommendedSlots = slotsResult.slots.filter(
            (s) => s.status === "RECOMENDADO",
          );
          const candidateList =
            recommendedSlots.length > 0 ? recommendedSlots : slotsResult.slots;

          let suggestedTime = "";
          if (candidateList.length > 0) {
            const reqMins = timeToMinutes(args.time);
            const sortedByDiff = [...candidateList].sort((a, b) => {
              return (
                Math.abs(timeToMinutes(a.time) - reqMins) -
                Math.abs(timeToMinutes(b.time) - reqMins)
              );
            });
            suggestedTime = sortedByDiff[0].time;
          }

          if (suggestedTime) {
            const ai_response = `Temos horário disponível às ${suggestedTime}. Pode ser?`;
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
              ai_response: [ai_response],
            });
          } else {
            const ai_response =
              "Infelizmente não temos mais horários disponíveis para este dia. Deseja verificar outra data?";
            await prisma.chatMessage.create({
              data: {
                role: "model",
                content: ai_response,
                shopId: Number(shopId),
                clientPhone,
              },
            });

            return NextResponse.json({
              status: "FULL",
              ai_response: [ai_response],
            });
          }
        }

        // 2. TRANSAÇÃO DE GRAVAÇÃO COM TRAVA DE CONCORRÊNCIA
        const startAt = new Date(`${args.date}T${args.time}:00-03:00`);
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
            ai_response: [successMsg],
            details: finalAppointment,
          });
        } catch (txError: unknown) {
          const errorMessage = txError instanceof Error ? txError.message : "";

          if (errorMessage === "TIME_SLOT_TAKEN") {
            const ai_response =
              "Ops, esse horário acabou de ser preenchido por outro cliente. Podemos escolher outro?";
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
              ai_response: [ai_response],
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
    console.error("Erro no processamento:", error);

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
      { status: "Error", message: errorMessage },
      { status: 500 },
    );
  }
}
