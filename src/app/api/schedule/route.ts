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

    // Busca grade ocupada dos próximos 2 dias
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

SITUAÇÕES DE AGENDAMENTO:
  1. Agendamento Ativo: Se o cliente mandar apenas uma saudação, diga exatamente: "Olá! Vi que você já tem horário dia [DATA] às [HORA]. Como posso ajudar?". Se ele fizer uma pergunta ou pedido direto, ignore a saudação e responda à dúvida dele diretamente.
  2. Coleta do Serviço PRIMEIRO:
     - Para calcular a disponibilidade de horários, você PRECISA saber qual o serviço desejado.
     - Se o cliente perguntar se tem vaga em determinado dia ou horário e AINDA NÃO tiver informado o serviço, pergunte PRIMEIRO qual serviço ele deseja realizar (a menos que a loja só tenha 1 serviço).
  3. Consulta e Validação Obrigatória na Grade:
     - OBRIGATÓRIO: Toda solicitação de agendamento EXIGE que você chame PRIMEIRO a ferramenta 'getAvailableSlots' para verificar a disponibilidade na grade.
     - NUNCA chame 'scheduleAppointment' sem antes ter chamado 'getAvailableSlots' e confirmado que o horário desejado consta no 'grid' de horários disponíveis.
     - Se o horário solicitado pelo cliente ESTIVER no 'grid' retornado por 'getAvailableSlots', acione 'scheduleAppointment' (ou peça o nome se ainda não tiver).
     - Se o horário solicitado NÃO ESTIVER no 'grid' (ou se a grade estiver vazia/fechada), NÃO acione 'scheduleAppointment'. Informe educadamente que o horário não está disponível e ofereça as opções do 'grid'.
  4. Ocupado/Almoço: Se sugerir apenas UM horário alternativo, use: "Temos horário disponível às [hora sugerida]. Pode ser?". Se sugerir MAIS DE UM horário, termine com "Qual prefere?".
  5. Retorno do 'getAvailableSlots':
   - SE O RETORNO INDICAR 'isClosed: true': Informe educadamente que a barbearia estará FECHADA e pergunte se deseja verificar outro dia.
   - SE HOUVER HORÁRIOS LIVRES (isClosed: false e grid com horários):
     * Se o cliente especificou um horário e ele consta no grid: Agende via 'scheduleAppointment' (ou peça o nome se faltar).
     * Se o cliente perguntou genericamente por horários no dia: Apenas confirme que SIM, existem horários livres e peça para o cliente informar o horário desejado.
   - SE A GRADE ESTIVER VAZIA: Informe que os horários já estão todos lotados para esse dia e pergunte se pode ser em outro dia.

REGRAS GERAIS:
  - ${unicoServico ? `Serviço único: ${unicoServico}. Como a barbearia só possui este serviço, NUNCA pergunte qual serviço o cliente deseja e NUNCA mencione o nome dele nas respostas.` : ""}
  - ${unicoBarbeiro ? `Barbeiro único: ${unicoBarbeiro}. Como a barbearia só possui este barbeiro, NUNCA mencione o nome dele nas respostas.` : ""}
  - Funcionamento: Seg-Sáb ${shopData.openingTime}-${shopData.closingTime}. Dom: ${shopData.isClosedSunday ? "Fechado" : `${shopData.openingSunday}-${shopData.closingSunday}`}.
  - Almoço: ${shopData.hasLunchBreak ? `${shopData.lunchStart}-${shopData.lunchEnd}` : "Não possui intervalo de almoço"}.
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
              "Executa o agendamento final. OBRIGATÓRIO: Só execute esta ferramenta APÓS ter consultado 'getAvailableSlots' e confirmado que o horário solicitado pelo cliente está no grid.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                barberName: {
                  type: SchemaType.STRING,
                  description: `Nome do barbeiro. Se houver apenas um (${unicoBarbeiro}), use '${unicoBarbeiro}' automaticamente.`,
                },
                date: {
                  type: SchemaType.STRING,
                  description: "Data no formato YYYY-MM-DD",
                },
                time: {
                  type: SchemaType.STRING,
                  description: "Hora no formato HH:MM escolhida pelo usuário.",
                },
                serviceName: {
                  type: SchemaType.STRING,
                  description: `Nome exato do serviço. Se houver apenas um (${unicoServico}), use '${unicoServico}' automaticamente.`,
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
              "OBRIGATÓRIO CHAMAR ANTES DE QUALQUER AGENDAMENTO. Busca a grade completa de horários de um dia específico para validar a disponibilidade.",
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
          const result = await getAvailableSlotsForDay(
            Number(shopId),
            date,
            targetBarber.id,
            targetService.durationMinutes,
          );

          if (result.isClosed) {
            functionResponse = {
              isClosed: true,
              reason: result.closedReason,
              message: result.closedReason,
            };
          } else {
            const slotsDisponiveis = result.slots.filter(
              (s) => s.status === "DISPONIVEL" || s.status === "RECOMENDADO",
            );

            functionResponse = {
              isClosed: false,
              date,
              barberName,
              serviceName,
              grid: slotsDisponiveis.map((s) => ({
                horario: s.time,
                preferencial:
                  s.status === "RECOMENDADO"
                    ? "SIM (Ofereça este primeiro ao cliente)"
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

        // VALIDAÇÃO DE SEGURANÇA NA GRADE (Fonte da Verdade Única)
        const slotValidation = await getAvailableSlotsForDay(
          Number(shopId),
          args.date,
          targetBarber.id,
          targetService.durationMinutes,
        );

        if (slotValidation.isClosed) {
          const closedMsg =
            slotValidation.closedReason ||
            "A barbearia estará fechada nesta data.";
          await prisma.chatMessage.create({
            data: {
              role: "model",
              content: closedMsg,
              shopId: Number(shopId),
              clientPhone,
            },
          });
          return NextResponse.json({
            status: "CLOSED",
            ai_response: [closedMsg],
          });
        }

        const isSlotAvailable = slotValidation.slots.some(
          (s) =>
            s.time === args.time &&
            (s.status === "DISPONIVEL" || s.status === "RECOMENDADO"),
        );

        if (!isSlotAvailable) {
          const availableSlots = slotValidation.slots.filter(
            (s) => s.status === "DISPONIVEL" || s.status === "RECOMENDADO",
          );

          let ai_response = "";
          if (availableSlots.length > 0) {
            const suggestTime = availableSlots[0].time;
            ai_response = `Temos horário disponível às ${suggestTime}. Pode ser?`;
          } else {
            ai_response =
              "Infelizmente os horários para este dia já estão todos lotados. Deseja agendar para outro dia?";
          }

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

        // CÁLCULO E GRAVAÇÃO DO AGENDAMENTO
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
            const freshSlots = await getAvailableSlotsForDay(
              Number(shopId),
              args.date,
              targetBarber.id,
              targetService.durationMinutes,
            );

            const firstFree = freshSlots.slots.find(
              (s) => s.status === "DISPONIVEL" || s.status === "RECOMENDADO",
            );

            const ai_response = firstFree
              ? `Temos horário disponível às ${firstFree.time}. Pode ser?`
              : "Esse horário acabou de ser ocupado e não há mais vagas neste dia. Deseja verificar outro dia?";

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
