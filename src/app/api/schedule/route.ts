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

    // 1. Busca o último agendamento confirmado do cliente
    const now = new Date();
    const latestAppointment = await prisma.appointment.findFirst({
      where: {
        clientPhone: clientPhone,
        shopId: Number(shopId),
        status: "CONFIRMED",
      },
      include: { barber: true, service: true },
      orderBy: { startTime: "desc" },
    });

    let appointmentInfo = "";
    let upcomingAppointment = null;

    if (latestAppointment) {
      // Verifica se o horário de término já passou
      const isPassed = latestAppointment.endTime <= now;

      const dateStr = latestAppointment.startTime.toLocaleDateString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      });
      const timeStr = latestAppointment.startTime.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      });

      if (isPassed) {
        appointmentInfo = `\n- HISTÓRICO: O último agendamento do cliente (dia ${dateStr} às ${timeStr}) JÁ FOI CONCLUÍDO/PASSOU. O cliente NÃO possui agendamentos ativos e está livre para marcar um novo.`;
      } else {
        upcomingAppointment = latestAppointment;
        appointmentInfo = `\n- AGENDAMENTO ATIVO: O cliente JÁ TEM um agendamento futuro confirmado para o dia ${dateStr} às ${timeStr} (${latestAppointment.service.name} com ${latestAppointment.barber.name}).`;
      }
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

    const systemInstruction = `Você é o assistente virtual da "${shopData.name}".
${appointmentInfo}
Hoje: ${currentDate}.

REGRAS DE FORMATAÇÃO E COMPORTAMENTO (STRICT):
  - Responda SEMPRE em UMA ÚNICA mensagem super objetiva e resumida (máximo 1 ou 2 frases curtas).
  - NUNCA envie mensagens separadas e NUNCA use saudações longas ou frases genéricas como "Como posso ajudar?" ou "Em que posso ser útil?".
  - A primeira pergunta junto com a saudação SEMPRE deve ser perguntando para qual serviço ele deseja agendar (ex: (saudação). Para qual serviço deseja agendar?)
  - Se for a primeira mensagem do cliente, faça uma saudação bem curta (ex: "Olá! Bem-vindo à ${shopData.name}.") e já responda à pergunta dele na mesma mensagem (se a primeira mensagem dele for uma pergunta).
  - Se a conversa já estiver em andamento, vá DIRETO ao ponto, sem saudações ("Olá", "Tudo bem?").
  - Se precisar perguntar o nome do cliente, peça apenas o "nome" e não o "nome completo" ou "primeiro nome".
  - SEMPRE faça apenas uma pergunta por mensagem.

REGRAS PARA AGENDAMENTOS EXISTENTES E CANCELAMENTO:
  - Se o cliente tiver AGENDAMENTO ATIVO no futuro:
    * Se ele só mandou um "Oi", avise-o do agendamento: "Olá! Lembrete: você tem agendamento dia [DATA] às [HORA]. Deseja alterar ou precisa de algo mais?"
    * Se ele quiser remarcar, altere o agendamento ativo dele.
    * SE ELE PEDIR PARA CANCELAR: Pergunte primeiro se ele tem certeza que deseja cancelar o agendamento informando a data e horário. NUNCA execute a ação de cancelamento sem que o cliente responda 'Sim' ou confirme explicitamente.
  - Se o histórico disser que o agendamento JÁ PASSOU/FOI CONCLUÍDO: Trate como um cliente sem agendamento. Agende normalmente um novo horário sem mencionar o antigo.

REGRA ABSOLUTA DE COLETA DO SERVIÇO:
  ${
    unicoServico
      ? `A barbearia possui serviço único: ${unicoServico}. Assuma este serviço automaticamente sem perguntar.`
      : `NUNCA chame 'getAvailableSlots' sem saber o serviço desejado. Se o cliente perguntar por horários, pergunte PRIMEIRO qual serviço ele deseja.`
  }

CONSULTA DE HORÁRIOS E RETORNO:
  - Ao consultar disponibilidade ('getAvailableSlots'):
    * Se fechado: Informe o motivo brevemente.
    * Se o horário solicitado estiver livre: Confirme e peça o primeiro nome.
    * Se o horário solicitado estiver ocupado: Diga que está ocupado e sugira no máximo 2 opções próximas em uma frase curta.
    * Se perguntar horários gerais: Diga 2 ou 3 opções disponíveis de forma bem resumida.

REGRAS GERAIS:
  - ${
    unicoBarbeiro
      ? `Barbeiro único: ${unicoBarbeiro}. Não mencione o nome do barbeiro nas respostas.`
      : ""
  }
  - Funcionamento: Seg-Sáb ${shopData.openingTime}-${
    shopData.closingTime
  }. Dom: ${
    shopData.isClosedSunday
      ? "Fechado"
      : `${shopData.openingSunday}-${shopData.closingSunday}`
  }.
  - Almoço: ${
    shopData.hasLunchBreak
      ? `${shopData.lunchStart}-${shopData.lunchEnd}`
      : "Sem intervalo"
  }.

SERVIÇOS DISPONÍVEIS:
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
            description:
              "Cancela definitivamente o agendamento ativo. SÓ chame esta função se o cliente CONFIRMOU EXPLICITAMENTE (ex: disse 'Sim' ou 'Pode cancelar') após ser perguntado.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                confirm: {
                  type: SchemaType.BOOLEAN,
                  description:
                    "Deve ser true quando o cliente confirmou explicitamente o cancelamento.",
                },
              },
              required: ["confirm"],
            },
          },
          {
            name: "getAvailableSlots",
            description:
              "Busca a disponibilidade de horários para um dia e serviço.",
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
                2,
                15,
              );
            }

            const recomendados = slotsResult.slots
              .filter((s) => s.status === "RECOMENDADO")
              .map((s) => s.time);

            let sugestoesGerais: string[] = [];
            if (recomendados.length >= 3) {
              sugestoesGerais = [
                recomendados[0],
                recomendados[Math.floor(recomendados.length / 2)],
                recomendados[recomendados.length - 1],
              ];
            } else if (recomendados.length > 0) {
              sugestoesGerais = recomendados;
            } else {
              const disponiveis = slotsResult.slots.map((s) => s.time);
              if (disponiveis.length >= 3) {
                sugestoesGerais = [
                  disponiveis[0],
                  disponiveis[Math.floor(disponiveis.length / 2)],
                  disponiveis[disponiveis.length - 1],
                ];
              } else {
                sugestoesGerais = disponiveis;
              }
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
              sugestoesRecomendadasGerais: sugestoesGerais,
              totalSlotsDisponiveis: slotsResult.slots.length,
            };
          }
        }
      }

      if (call.name === "cancelAppointment") {
        if (!upcomingAppointment) {
          return NextResponse.json({
            status: "ERROR",
            ai_response: ["Você não tem nenhum agendamento ativo no momento."],
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
          ai_response: ["Seu agendamento foi cancelado com sucesso."],
        });
      }

      if (call.name === "scheduleAppointment") {
        const args = call.args as unknown as ScheduleArgs;

        if (!args.time || !args.date) {
          return NextResponse.json({
            status: "ERROR",
            ai_response: ["Preciso da data e do horário para agendar."],
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
            ai_response: ["Não encontrei o serviço ou barbeiro informado."],
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
          const sugestoes = getClosestSlots(
            slotsResult.slots,
            args.time,
            2,
            15,
          );

          if (sugestoes.length > 0) {
            const ai_response = `O horário das ${args.time} não está disponível. Temos às ${sugestoes.join(" ou ")}. Qual prefere?`;
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
              "Infelizmente não temos horários disponíveis para este dia. Quer verificar outra data?";
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

            // Se o cliente tem um agendamento ATIVO no futuro, atualiza ele. Caso contrário, cria um novo!
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
            ? "Seu horário foi alterado com sucesso!"
            : "Agendamento realizado com sucesso!";

          return NextResponse.json({
            status: "SUCCESS",
            ai_response: [successMsg],
            details: finalAppointment,
          });
        } catch (txError: unknown) {
          const errorMessage = txError instanceof Error ? txError.message : "";

          if (errorMessage === "TIME_SLOT_TAKEN") {
            const ai_response =
              "Esse horário acabou de ser preenchido por outro cliente. Escolha outro, por favor.";
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
          content: aiFinalText.trim(),
          shopId: Number(shopId),
          clientPhone,
        },
      });

      return NextResponse.json({
        status: "TEXT_RESPONSE",
        ai_response: [aiFinalText.trim()],
      });
    } else {
      return NextResponse.json({
        status: "TEXT_RESPONSE",
        ai_response: ["Entendido! Como posso ajudar?"],
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
          "Tive um pequeno problema. Por favor, repita sua mensagem.",
        ],
      });
    }

    return NextResponse.json(
      { status: "Error", message: errorMessage },
      { status: 500 },
    );
  }
}
