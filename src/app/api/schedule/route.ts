import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { startNewChat } from "@/lib/gemini";
import { ChatSession, Part, SchemaType, Tool } from "@google/generative-ai";
import { getAvailableSlotsForDay, getClosestSlots } from "@/utils/slots";

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
  serviceName: string;
  requestedTime?: string;
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

    const servicosInfo = shopData.services
      .map((s) => `- ${s.name}: ${s.durationMinutes} min`)
      .join("\n");

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

DIRETRIZES DE SAUDAÇÃO E COMPORTAMENTO:
  - Na primeira mensagem da conversa, faça uma saudação curta (ex: "Olá, bem-vindo à ${shopData.name}.") integrada com a resposta ao cliente.
  - NUNCA use frases genéricas de preenchimento como "Como posso ajudar?", "O que deseja?" ou "Em que posso ser útil?", EXCETO na situação de 'Agendamento Ativo', onde você deve perguntar como pode ajudar.
  - Se o cliente mandou uma pergunta ou pedido junto com o "Oi", envie a saudação curta e, na mesma resposta, já responda à pergunta dele.
  - Se a conversa já estiver em andamento, NUNCA repita saudações ("Olá", "Tudo bem?", etc). Vá direto ao ponto.
  - Se o cliente aceitar uma sugestão sua: Responda apenas "Ok" antes de pedir os dados restantes.
  - Se precisar perguntar o nome do cliente, NUNCA peça o nome inteiro, peça apenas o primeiro nome.
  - Seja profissional, mas direto (máximo 2 frases). Separe por ponto final.

REGRA ABSOLUTA DE COLETA DO SERVIÇO:
  ${unicoServico ? `A barbearia possui serviço único: ${unicoServico}. Assuma este serviço automaticamente sem perguntar ao cliente.` : `NUNCA chame a ferramenta 'getAvailableSlots' e NUNCA confirme horários se o cliente ainda NÃO informou qual serviço deseja realizar. Se o cliente perguntar por disponibilidade ou horários (ex: "Tem horário hoje?", "Tem às 14h?"), pergunte PRIMEIRO qual serviço ele quer fazer.`}

SITUAÇÕES DE AGENDAMENTO:
  1. Agendamento Ativo: Se o cliente mandar apenas uma saudação, diga exatamente: "Olá! Vi que você já tem horário dia [DATA] às [HORA]. Como posso ajudar?".
  2. Confirmação e Consulta de Horários (Apenas APÓS ter o serviço definido):
     - Acione a ferramenta 'getAvailableSlots' fornecendo a data, o serviço e, se o cliente perguntou por um horário específico (ex: "Tem às 15h?"), passe o parâmetro 'requestedTime' no formato HH:MM (ex: "15:00").
     - Se o cliente perguntou por um horário específico:
       * Se 'horarioSolicitadoDisponivel' for true: Confirme que o horário das [HORA] está livre e peça o nome do cliente.
       * Se 'horarioSolicitadoDisponivel' for false: Diga educadamente que o horário solicitado não está livre. Se a lista 'sugestoesHorariosMaisProximos' tiver horários, ofereça EXATAMENTE esses horários. Se a lista estiver vazia, diga que não há horários próximos no período e pergunte se prefere outro período.
  3. Retorno do 'getAvailableSlots':
     - SE 'isClosed: true': Informe o motivo do fechamento ao cliente e pergunte se deseja verificar outro dia.
     - SE HOUVER HORÁRIOS LIVRES (sem horário específico do cliente): NÃO liste todos os horários. Apenas confirme que existem horários livres e peça para o cliente dizer o horário de preferência dele.
     - SE A GRADE ESTIVER VAZIA: Informe que os horários do dia estão lotados e pergunte se deseja verificar outra data.

REGRAS GERAIS:
  - ${unicoBarbeiro ? `Barbeiro único: ${unicoBarbeiro}. Nunca mencione o nome do barbeiro nas respostas a menos que perguntado.` : ""}
  - Funcionamento: Seg-Sáb ${shopData.openingTime}-${shopData.closingTime}. Dom: ${shopData.isClosedSunday ? "Fechado" : `${shopData.openingSunday}-${shopData.closingSunday}`}.
  - Almoço: ${shopData.hasLunchBreak ? `${shopData.lunchStart}-${shopData.lunchEnd}` : "Não possui intervalo de almoço"}.
  - Use nomes reais de serviços conforme a lista cadastrada.

SERVIÇOS DISPONÍVEIS NA LOJA:
${servicosInfo}`;

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
                  description: unicoBarbeiro
                    ? `Nome do barbeiro. Use '${unicoBarbeiro}' automaticamente.`
                    : "Nome do barbeiro selecionado.",
                },
                date: {
                  type: SchemaType.STRING,
                  description: "Data no formato YYYY-MM-DD",
                },
                time: {
                  type: SchemaType.STRING,
                  description: "Hora no formato HH:MM",
                },
                serviceName: {
                  type: SchemaType.STRING,
                  description: unicoServico
                    ? `Nome do serviço. Use '${unicoServico}' automaticamente.`
                    : "Nome exato do serviço escolhido pelo cliente.",
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
              "Busca a grade completa ou sugestões mais próximas de horários de um dia para barbeiro e serviço.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                date: {
                  type: SchemaType.STRING,
                  description: "Data no formato YYYY-MM-DD",
                },
                barberName: {
                  type: SchemaType.STRING,
                  description: unicoBarbeiro
                    ? `Nome do barbeiro. Use '${unicoBarbeiro}' automaticamente.`
                    : "Nome do barbeiro.",
                },
                serviceName: {
                  type: SchemaType.STRING,
                  description: unicoServico
                    ? `Nome do serviço. Use '${unicoServico}' automaticamente.`
                    : "Nome do serviço explicitamente informado pelo cliente.",
                },
                requestedTime: {
                  type: SchemaType.STRING,
                  description:
                    "Horário específico perguntado pelo cliente no formato HH:MM (ex: 15:00), se houver.",
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
        const { date, barberName, serviceName, requestedTime } =
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
            let sugestoesProximas: string[] = [];
            let isRequestedAvailable = false;
            let formattedRequestedTime: string | null = null;

            if (requestedTime) {
              formattedRequestedTime = requestedTime.trim().slice(0, 5);

              const requestedSlot = slotsResult.slots.find(
                (s) => s.time === formattedRequestedTime,
              );

              isRequestedAvailable =
                requestedSlot?.status === "DISPONIVEL" ||
                requestedSlot?.status === "RECOMENDADO";

              sugestoesProximas = getClosestSlots(
                slotsResult.slots,
                formattedRequestedTime,
                120,
              );
            }

            functionResponse = {
              isClosed: false,
              date,
              barberName,
              serviceName,
              horarioSolicitado: formattedRequestedTime,
              horarioSolicitadoDisponivel: formattedRequestedTime
                ? isRequestedAvailable
                : null,
              sugestoesHorariosMaisProximos: sugestoesProximas,
              totalSlots: slotsResult.slots.length,
              grid: slotsResult.slots.map((s) => ({
                horario: s.time,
                status: s.status,
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

        const chosenSlot = slotsResult.slots.find((s) => s.time === args.time);

        if (!chosenSlot) {
          const sugestoes = getClosestSlots(slotsResult.slots, args.time, 120);

          if (sugestoes.length > 0) {
            const ai_response = `O horário das ${args.time} não está mais livre. Temos opções às ${sugestoes.join(" ou ")}. Pode ser?`;
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
