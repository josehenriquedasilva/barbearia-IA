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
  maxRetries = 4,
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
        errorMessage.includes("high demand") ||
        errorMessage.includes("timeout") ||
        errorMessage.includes("deadline");

      if (isOverloaded && retryCount < maxRetries) {
        retryCount++;
        const delay = retryCount * 3000;
        console.log(
          `Gemini ocupado/lento. Tentativa ${retryCount} de ${maxRetries}. Aguardando ${delay / 1000}s...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
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

EQUIPE DE BARBEIROS DISPONÍVEIS (NUNCA INVENTE OUTROS NOMES):
${barbeiroNames.join(", ")}

SERVIÇOS DISPONÍVEIS:
${servicosInfo}

REGRAS DE FORMATAÇÃO E COMPORTAMENTO (STRICT):
  - Responda SEMPRE em UMA ÚNICA mensagem super objetiva e resumida (máximo 1 ou 2 frases curtas).
  - NUNCA envie mensagens separadas e NUNCA use saudações longas ou frases genéricas como "Como posso ajudar?".
  - Se for a primeira mensagem do cliente, faça uma saudação bem curta (ex: "Olá! Bem-vindo à ${shopData.name}.") e já responda à pergunta dele.
  - Se a conversa já estiver em andamento, vá DIRETO ao ponto, sem saudações.
  - Se precisar perguntar o nome do cliente, peça apenas o "nome".
  - SEMPRE faça apenas uma pergunta por mensagem.

INTERPRETAÇÃO DE FRASES INFORMAIS E SERVIÇOS:
  - Se o cliente usar termos informais como "cortar o cabelo", "fazer a barba", relacione IMEDIATAMENTE ao serviço correspondente listado acima em "SERVIÇOS DISPONÍVEIS". Não fique pedindo para repetir se o serviço for óbvio pela lista.
  - Se o cliente perguntar quem são os barbeiros, cite apenas os nomes reais cadastrados na barbearia (${barbeiroNames.join(", ")}). NUNCA invente nomes.

REGRAS PARA AGENDAMENTOS EXISTENTES E CANCELAMENTO:
  - Se o cliente tiver AGENDAMENTO ATIVO no futuro:
    * Se ele só mandou um "Oi", avise-o do agendamento: "Olá! Lembrete: você tem agendamento dia [DATA] às [HORA]. Deseja alterar ou precisa de algo mais?"
    * Se ele quiser remarcar, altere o agendamento ativo dele.
    * SE ELE PEDIR PARA CANCELAR: Pergunte primeiro se ele tem certeza informando a data e horário. NUNCA execute o cancelamento sem que o cliente responda 'Sim' explicitamente.
  - Se o histórico disser que o agendamento JÁ PASSOU/FOI CONCLUÍDO: Trate como um cliente sem agendamento.

REGRA ABSOLUTA DE COLETA DO SERVIÇO:
  ${
    unicoServico
      ? `A barbearia possui serviço único: ${unicoServico}. Assuma este serviço automaticamente sem perguntar.`
      : `Se o cliente perguntar por vagas/horários sem citar o serviço, relacione pelo contexto informal ou pergunte qual serviço ele deseja.`
  }`;

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
                    : `Nome do barbeiro selecionado dentre os disponíveis: ${barbeiroNames.join(", ")}`,
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
              "Cancela definitivamente o agendamento ativo. SÓ chame se o cliente confirmou explicitamente.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                confirm: {
                  type: SchemaType.BOOLEAN,
                  description:
                    "Deve ser true quando o cliente confirmou explicitamente.",
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
                    : `Nome do barbeiro escolhido dentre: ${barbeiroNames.join(", ")}`,
                },
                serviceName: {
                  type: SchemaType.STRING,
                  description: unicoServico
                    ? `Nome do serviço. Use '${unicoServico}' automaticamente.`
                    : "Nome do serviço informado pelo cliente.",
                },
                requestedTime: {
                  type: SchemaType.STRING,
                  description:
                    "Horário específico perguntado no formato HH:MM, se houver.",
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
    console.error("Erro no processamento:", error, errorMessage);

    // 🔴 MELHORIA: Agora QUALQUER erro inesperado (500, timeout, etc) avisa o cliente para repetir
    return NextResponse.json({
      status: "TEXT_RESPONSE",
      ai_response: [
        "Tive um pequeno problema de conexão. Por favor, repita sua última mensagem.",
      ],
    });
  }
}
