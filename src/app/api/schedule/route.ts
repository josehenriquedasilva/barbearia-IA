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

    const listaResumida =
      shopData.services
        .slice(0, 3)
        .map((s) => s.name)
        .join(", ") + (shopData.services.length > 3 ? "..." : "");

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

    REGRAS DE COLETA DE DADOS:
    1. Quando o cliente aceitar um horário, mas ainda faltar o Nome e o Serviço, responda exatamente: "Ok. Para concluir, me informe seu nome e qual destes serviços deseja: [LISTA_CURTA_DE_NOMES]".
    2. Na lista de serviços, use apenas os nomes (ex: Corte, Barba, Sobrancelha) para ser breve.
    3. Se o cliente já informou o serviço mas não o nome, peça apenas o nome.
    4. Se faltar o Serviço, ofereça apenas estes exemplos: ${listaResumida}.
    5. ENTENDIMENTO DE ABREVIAÇÕES: O cliente pode abreviar os nomes (ex: dizer "cabelo" para "Corte"). Use a "LISTA DE SERVIÇOS" abaixo para identificar qual é o serviço correto e use sempre o NOME REAL ao chamar as ferramentas.
    6. 3. Nunca liste todos os serviços de uma vez, a menos que o cliente peça explicitamente.
    7. Seja ultra-direto. Nunca use frases como "Para prosseguir com o agendamento".

    REGRAS DE OTIMIZAÇÃO DE AGENDA:
    1. Se a Tool retornar "isGap: true", ignore o horário que o cliente pediu originalmente.
    2. Responda APENAS: "O horário das [requestedTime] está livre, mas pode ser às [suggestedCloserTime] para me ajudar na agenda? Pode ser?"
    3. Seja extremamente seco e direto. Não explique que o atendimento anterior acaba em tal hora.

    ESTRATÉGIA DE BURACO NA AGENDA (isGap):
    - Se a Tool retornar "isGap: true", ignore o horário que o cliente pediu.
    - Responda apenas: "Olá. Tenho horário livre às [suggestedCloserTime]. Pode ser?"
    - PROIBIDO dizer que o horário pedido está vago ou livre. 
    - Vá direto para a sugestão do [suggestedCloserTime].
    

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

    REGRAS DE DISPONIBILIDADE E REMARCAÇÃO:
    1. NUNCA diga que um horário está livre sem chamar "checkAvailability".
    2. Ao remarcar, a Tool retornará sugestões de horários vagos "ANTES" e "DEPOIS" do solicitado.
    3. PRIORIDADE DE SUGESTÃO:
       - Se o cliente pediu para adiantar (antes) e a Tool retornar um horário em "options.before", ofereça este PRIMEIRO. 
      - Se o cliente pediu para atrasar (depois) e a Tool retornar "options.after", ofereça este PRIMEIRO.
      - NUNCA pule para o dia seguinte se houver qualquer vaga (antes ou depois) no dia atual, a menos que o cliente explicitamente peça outro dia.
      - Se o retorno da Tool checkAvailability contiver o objeto options, você é OBRIGADO a usar os horários ali presentes para justificar sua resposta ao cliente. Priorize o options.before se o tom da conversa for de adiantar.
    4. NUNCA diga "não há horários antes" apenas porque o cliente já tem um agendamento futuro. Sempre ofereça a vaga livre mais próxima do horário que ele PEDIU.
    5. SE O DIA ESTIVER LOTADO: Se a Tool indicar que não há mais vagas hoje, consulte a "OCUPAÇÃO ATUAL" para o dia seguinte e sugira o primeiro horário disponível de amanhã.
    6. NUNCA sugira o horário que ele já tem marcado como uma "nova opção".

    COMPORTAMENTO:
    - Seja ultra-direto. Máximo 2 frases.
    - Se o horário pedido estiver ocupado ou for Almoço (${shopData.lunchStart}-${shopData.lunchEnd}), olhe a "OCUPAÇÃO ATUAL" e sugira o próximo horário vago imediatamente.
    - Se sugerir um horário, a frase deve ser: "Pode ser às [HORA]?" ou "Consegue vir às [HORA]?"
    - NUNCA use justificativas longas como "para mantermos a sequência".
    - Considere sempre 10 minutos de intervalo entre os agendamentos.
    - SEPARE as informações por ponto final. 
    - Exemplo: "Vi que você já tem horário às 13h. O das 16h também está livre, quer remarcar?"

    COMPORTAMENTO EM OCUPADO:
    - Se a Tool responder que está ocupado: "O das [hora pedida] está ocupado. Consigo encaixar você às [hora sugerida], que é o mais próximo do que você quer. Pode ser?"
    - Seja ultra-direto. Máximo 2 frases. Use pontos finais para separar as informações.
    - Se a Tool sugerir um horário muito distante do pedido (ex: diferença maior que 2 horas), pergunte se o cliente prefere ver os horários de outro turno ou do dia seguinte antes de confirmar.

    REGRAS DE FUNCIONAMENTO:
    - Seg-Sáb: ${shopData.openingTime} às ${shopData.closingTime}.
    - Domingo: ${shopData.isClosedSunday ? "Fechado" : `Aberto ${shopData.openingSunday} às ${shopData.closingSunday}`}.
    - Almoço: ${shopData.hasLunchBreak ? `${shopData.lunchStart} às ${shopData.lunchEnd}` : "Sem intervalo"}.

    OCUPAÇÃO ATUAL (Não agende nestes horários):
    ${busyScheduleString}

    SERVIÇOS (Mapeamento Interno):
    ${servicosInfo} 

    FLUXO: Saudação -> Verificação de Disponibilidade -> Sugestão/Aceite de Horário -> Coleta de Dados Restantes (Nome/Serviço) -> scheduleAppointment.

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
                  description:
                    "O nome EXATO do serviço conforme a lista fornecida no sistema (ex: use 'Corte de Cabelo' mesmo que o cliente diga 'cabelo').",
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
        const startOfDay = new Date(`${date}T00:00:00-03:00`);
        const endOfDay = new Date(`${date}T23:59:59-03:00`);
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
            const lastAppointmentBefore = await prisma.appointment.findFirst({
              where: {
                barberId: targetBarber.id,
                status: "CONFIRMED",
                startTime: { lt: startAt, gte: startOfDay },
                NOT: { id: upcomingAppointment?.id },
              },
              orderBy: { endTime: "desc" },
            });

            const nextAppointmentAfter = await prisma.appointment.findFirst({
              where: {
                barberId: targetBarber.id,
                status: "CONFIRMED",
                startTime: { gte: startAt, lte: endOfDay },
                NOT: { id: upcomingAppointment?.id },
              },
              orderBy: { startTime: "asc" },
            });

            const timeToStr = (d: Date) =>
              d.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "America/Sao_Paulo",
              });

            const suggestedBefore = lastAppointmentBefore
              ? timeToStr(new Date(lastAppointmentBefore.endTime))
              : shopData.openingTime;

            const suggestedAfter = nextAppointmentAfter
              ? timeToStr(nextAppointmentAfter.endTime)
              : "sem mais vagas hoje";

            functionResponse = {
              available: false,
              message: `O horário das ${time} está ocupado.`,
              options: {
                before: suggestedBefore,
                after: suggestedAfter,
              },
              requestedTime: time,
            };
          } else {
            const lastBefore = await prisma.appointment.findFirst({
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

            if (lastBefore) {
              const idealStartTime = new Date(lastBefore.endTime);

              const diffInMinutes =
                (startAt.getTime() - idealStartTime.getTime()) / 60000;

              if (diffInMinutes > 0 && diffInMinutes <= 45) {
                functionResponse = {
                  available: true,
                  isGap: true,
                  suggestedCloserTime: timeToStr(idealStartTime),
                  requestedTime: time,
                };
              } else {
                functionResponse = { available: true };
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
                functionResponse = {
                  available: true,
                  isGap: true,
                  suggestedCloserTime: shopData.openingTime,
                  requestedTime: time,
                };
              } else {
                functionResponse = { available: true };
              }
            }
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
          let suggestTime = existing.endTime.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/Sao_Paulo",
          });

          const clientTime = upcomingAppointment?.startTime.toLocaleTimeString(
            "pt-BR",
            { hour: "2-digit", minute: "2-digit" },
          );

          if (suggestTime === clientTime) {
            const nextTick = new Date(
              upcomingAppointment!.endTime.getTime() + 10 * 60000,
            );

            suggestTime = nextTick.toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            });
          }

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
        ai_response: ["Entendido! Como posso ajudar em algo mais?"],
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
          "Ou aguarde que iremos lhe responder em breve.",
        ],
      });
    }

    return NextResponse.json(
      { status: "Error", message: (error as Error).message },
      { status: 500 },
    );
  }
}
