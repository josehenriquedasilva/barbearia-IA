import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { startNewChat, GeminiModelName } from "@/lib/gemini";
import {
  ChatSession,
  Content,
  Part,
  SchemaType,
  Tool,
} from "@google/generative-ai";
import { getAvailableSlotsForDay, getClosestSlots } from "@/utils/slots";

export const dynamic = "force-dynamic";

const MODELS_TO_TRY: GeminiModelName[] = [
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
];

interface GeminiHttpError extends Error {
  status?: number;
}

interface ScheduleArgs {
  barberName?: string;
  date: string;
  time: string;
  serviceName?: string;
  clientName?: string;
}

interface CheckArgs {
  barberName?: string;
  date: string;
  serviceName?: string;
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

function getDatesContext() {
  const tz = "America/Sao_Paulo";
  const now = new Date();

  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(
    now,
  );

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(
    tomorrow,
  );

  return { todayStr, tomorrowStr };
}

function isTransientGeminiError(error: unknown): boolean {
  const geminiErr = error as GeminiHttpError;
  const status = geminiErr?.status;
  const errorMessage = error instanceof Error ? error.message : "";

  return (
    status === 503 ||
    status === 429 ||
    errorMessage.includes("503") ||
    errorMessage.includes("429") ||
    errorMessage.includes("Service Unavailable") ||
    errorMessage.includes("high demand") ||
    errorMessage.includes("timeout") ||
    errorMessage.includes("deadline")
  );
}

function sanitizeHistoryForStartChat(history: Content[]): Content[] {
  const cleaned = history.filter((item) => item.parts && item.parts.length > 0);
  while (cleaned.length > 0 && cleaned[cleaned.length - 1].role === "user") {
    cleaned.pop();
  }
  return cleaned;
}

function buildFallbackTextFromSlotsResponse(
  data: Record<string, unknown> | null,
  hasMultipleServices: boolean,
): string {
  if (!data) {
    return "Pode me confirmar o serviço, dia e horário que você prefere?";
  }

  if (data.isClosed || data.semVagasNoDia) {
    return "Não temos horários disponíveis nessa data para o serviço solicitado. Deseja agendar para outro dia?";
  }

  const requestedTime =
    typeof data.horarioSolicitado === "string" && data.horarioSolicitado
      ? data.horarioSolicitado
      : null;
  const isAvailable = Boolean(data.horarioSolicitadoDisponivel);
  const closest = Array.isArray(data.sugestoesHorariosMaisProximos)
    ? (data.sugestoesHorariosMaisProximos as string[]).filter(Boolean)
    : [];
  const general = Array.isArray(data.sugestoesRecomendadasGerais)
    ? (data.sugestoesRecomendadasGerais as string[]).filter(Boolean)
    : [];

  if (requestedTime) {
    if (isAvailable) {
      return hasMultipleServices
        ? `Temos vaga às ${requestedTime}. Qual serviço você deseja?`
        : `Temos vaga às ${requestedTime}. Qual é o seu nome para concluir o agendamento?`;
    }
    if (closest.length >= 2) {
      return `O horário das ${requestedTime} não está disponível. Temos às ${closest[0]} ou ${closest[1]}. Qual prefere?`;
    }
    if (closest.length === 1) {
      return `O horário das ${requestedTime} não está disponível. Temos às ${closest[0]}. Pode ser?`;
    }
    return `O horário das ${requestedTime} não está disponível. Deseja verificar outro horário ou dia?`;
  }

  if (general.length >= 2) {
    const firstTwo = general.slice(0, 2);
    return `Temos horários disponíveis às ${firstTwo[0]} e às ${firstTwo[1]}. Qual prefere?`;
  }
  if (general.length === 1) {
    return `Temos horário disponível às ${general[0]}. Pode ser?`;
  }

  return "Não há horários disponíveis nessa data. Deseja verificar outro dia?";
}

async function sendMessageAcrossModels(params: {
  chat: ChatSession | null;
  currentModel: GeminiModelName | null;
  systemInstruction: string;
  tools: Tool[];
  fallbackHistory: Content[];
  content: string | (string | Part)[];
  fallbackTextContent?: string;
  maxRetriesPerModel?: number;
}) {
  const {
    chat,
    currentModel,
    systemInstruction,
    tools,
    fallbackHistory,
    content,
    fallbackTextContent,
    maxRetriesPerModel = 2,
  } = params;

  const startIndex = currentModel
    ? Math.max(0, MODELS_TO_TRY.indexOf(currentModel))
    : 0;
  const orderedModels = [
    ...MODELS_TO_TRY.slice(startIndex),
    ...MODELS_TO_TRY.slice(0, startIndex),
  ];

  let lastError: unknown;

  for (let mIndex = 0; mIndex < orderedModels.length; mIndex++) {
    const modelName = orderedModels[mIndex];
    const isUsingExistingSession =
      mIndex === 0 && chat !== null && currentModel === modelName;

    const preparedHistory = sanitizeHistoryForStartChat(fallbackHistory);

    const activeChat = isUsingExistingSession
      ? chat
      : startNewChat(systemInstruction, tools, preparedHistory, modelName);

    const payloadToSend =
      isUsingExistingSession || !fallbackTextContent
        ? content
        : fallbackTextContent;

    let retryCount = 0;

    while (retryCount <= maxRetriesPerModel) {
      try {
        const result = await activeChat.sendMessage(payloadToSend);
        return {
          result,
          chat: activeChat,
          modelName,
        };
      } catch (error: unknown) {
        lastError = error;
        const transient = isTransientGeminiError(error);

        if (!transient) {
          throw error;
        }

        if (retryCount < maxRetriesPerModel) {
          retryCount++;
          const delay = retryCount * 1000 + Math.floor(Math.random() * 400);
          console.log(
            `Gemini ocupado/lento no modelo ${modelName}. Tentativa ${retryCount} de ${maxRetriesPerModel}. Aguardando ${(delay / 1000).toFixed(1)}s...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        const nextModel = orderedModels[mIndex + 1];
        if (nextModel) {
          console.warn(
            `Modelo ${modelName} falhou após ${maxRetriesPerModel} tentativas. Fazendo fallback para ${nextModel}...`,
          );
        }
        break;
      }
    }
  }

  throw lastError;
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
        services: {
          where: { active: true },
          select: { id: true, name: true, durationMinutes: true },
        },
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
    const { todayStr, tomorrowStr } = getDatesContext();

    const unicoBarbeiro = barbeiroNames.length === 1 ? barbeiroNames[0] : null;
    const unicoServico =
      shopData.services.length === 1 ? shopData.services[0].name : null;

    const servicosInfo = shopData.services
      .map((s) => `- ${s.name}: ${s.durationMinutes} min`)
      .join("\n");

    const funcionamentoInfo = `
- Dias úteis/geral: Abre às ${shopData.openingTime} e fecha às ${shopData.closingTime}.
- Domingo: ${
      shopData.isClosedSunday.toString().toLowerCase() === "true" ||
      shopData.isClosedSunday
        ? "FECHADO aos domingos."
        : `ABERTO aos domingos das ${shopData.openingSunday || "09:00"} às ${shopData.closingSunday || "13:00"}.`
    }`;

    const lastMessages = await prisma.chatMessage.findMany({
      where: {
        shopId: Number(shopId),
        clientPhone,
        id: { notIn: currentMessageIds },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const history: Content[] = lastMessages.reverse().map((msg) => ({
      role: msg.role === "model" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    while (history.length > 0 && history[0].role === "model") {
      history.shift();
    }

    const systemInstruction = `Você é o assistente virtual da "${shopData.name}".
${appointmentInfo}
${
  upcomingAppointment
    ? `REGRA OBRIGATÓRIA PARA CLIENTE COM AGENDAMENTO ATIVO:
- O cliente JÁ POSSUI um agendamento ativo confirmado (detalhado acima).
- Se o cliente enviar uma mensagem genérica (como "olá", "boa tarde") ou tentar iniciar uma conversa, faça uma saudação simples como ("Olá") e informe-o imediatamente sobre o horário que ele já tem agendado.
- Pergunte claramente se ele deseja MANTER o horário atual, se quer CANCELAR (usando a ferramenta cancelAppointment) ou se deseja REMARCAR para outra data/horário. NUNCA comece a pedir o serviço do zero sem antes lembrá-lo do agendamento ativo!`
    : ""
}
Hoje é ${currentDate}.
REFERÊNCIA DE DATAS PARA OS ARGUMENTOS DA FUNÇÃO:
- Hoje = "${todayStr}"
- Amanhã = "${tomorrowStr}"

HORÁRIOS DE FUNCIONAMENTO DA LOJA:
${funcionamentoInfo}

EQUIPE DE BARBEIROS DISPONÍVEIS:
${barbeiroNames.join(", ")}
${
  unicoBarbeiro
    ? `- REGRA DE BARBEIRO ÚNICO: Há apenas UM barbeiro cadastrado (${unicoBarbeiro}). VOCÊ NUNCA DEVE citar ou mencionar o nome dele nas perguntas ou respostas, A NÃO SER QUE O CLIENTE pergunte explicitamente.`
    : `- Se o cliente NÃO especificou o barbeiro, pergunte se ele tem preferência por algum profissional (${barbeiroNames.join(", ")}) ou se pode ser com qualquer um.`
}

SERVIÇOS DISPONÍVEIS (uso interno para validação de agenda):
${servicosInfo}

REGRAS DE FORMATAÇÃO E COMPORTAMENTO (STRICT):
- Responda SEMPRE em UMA ÚNICA mensagem super objetiva e resumida (máximo 1 ou 2 frases curtas).
- NUNCA envie mensagens separadas e NUNCA use saudações longas ou frases genéricas como "Como posso ajudar?".
- NUNCA informe a duração (em minutos/horas) dos serviços ao listar ou mencionar os serviços, A NÃO SER QUE o cliente pergunte explicitamente quanto tempo dura ou qual a duração.
- "OBRIGATORIA" Se for a primeira mensagem do cliente, faça uma saudação bem curta (ex: "Olá! Bem-vindo à ${shopData.name}.") e já responda à pergunta dele.
- Se a primeira pergunta do cliente for perguntando a disponibilidade de um dia/horário, se estiver disponível informe a ele junto com a próxima pergunta para concluir o agendamento.
- Quando o cliente perguntar por um horário específico que NÃO estiver disponível e houver horário(s) sugerido(s), informe que o horário solicitado não está disponível e sugira o(s) horário(s) livre(s): se sugerir 2 horários, termine perguntando "Qual prefere?"; se sugerir 1 horário, termine perguntando "Pode ser?".
- FLUXO DE HORÁRIO SUGERIDO OU NOVO HORÁRIO SEM SERVIÇO DEFINIDO:
  - Quando o cliente perguntar por um horário e ele estiver indisponível, NÃO pergunte o serviço antes: informe que não está disponível e sugira outro(s) horário(s).
  - Se o cliente escolher um dos horários sugeridos (ou perguntar por outro horário e você verificar que está disponível) e o serviço ainda não tiver sido informado (e a loja tiver mais de um serviço), pergunte qual serviço ele deseja para verificar se encaixa na agenda de acordo com a duração do serviço, ANTES de pedir o nome do cliente para concluir o agendamento.
  - Assim que o cliente informar o serviço para um horário escolhido/disponível, chame "getAvailableSlots" passando o "serviceName" e o horário para validar se a duração do serviço cabe sem invadir outro horário, intervalo ou fechamento da barbearia; se couber, peça apenas o nome do cliente para concluir o agendamento.
- Se um dia inteiro estiver indisponível ou sem vagas (por exemplo, fechado, lotado ou "totalSlotsDisponiveis": 0), NUNCA sugira horários: responda de forma clara informando que o dia não está disponível para o serviço, e pergunte diretamente: "Deseja agendar para outro dia?".
- Se a conversa já estiver em andamento, vá DIRETO ao ponto, sem saudações.
- Se precisar perguntar o nome do cliente, peça apenas o "nome" e não o nome completo, e toda vez que pedir o nome, informe que é "para concluir o agendamento" (NUNCA diga "para concluir o cadastro").
- OBRIGATÓRIO: Antes de chamar a ferramenta "scheduleAppointment", você DEVE ter obtido o nome do cliente. Você DEVE passar o argumento "clientName" obrigatoriamente com o nome fornecido pelo usuário. NUNCA execute o agendamento sem o nome do cliente.
- SEMPRE faça apenas uma pergunta por mensagem. NUNCA faça duas perguntas na mesma mensagem (exceto na instrução padronizada acima de reagendamento/serviço caso o dia esteja indisponível).
- Nunca pergunte novamente informações que o cliente já forneceu nas mensagens anteriores (como nome, serviço escolhido, profissional, data ou horário). Quando um horário solicitado estiver indisponível, utilize os dados já coletados para sugerir novos horários ou dias imediatamente, sem reiniciar a triagem.

- NOÇÃO DE HORÁRIOS (12H / 24H / COLOQUIAL):
  - Clientes frequentemente falam horários no formato de 12 horas ou coloquial sem dizer "da manhã" ou "da tarde" (ex: "1 hora", "2 horas", "3 horas", "4 horas", "5 horas", "6 horas", "3 e meia") ou no formato de 24 horas ("13 horas", "15 horas", "15:30").
  - Sempre interprete o horário considerando o horário de funcionamento da loja (${funcionamentoInfo.trim()}).
  - Se o cliente disser um número de 1 a 6 (ex: "3 horas") sem dizer "da manhã" ou "madrugada" e a loja funcionar à tarde (ex: abre às 09:00 e fecha às 18:00/19:00/20:00), entenda como o horário da tarde correspondente ("15:00") para consultar disponibilidade e agendar — NUNCA assuma automaticamente que é 03:00 da madrugada só porque ele disse "3 horas", a menos que ele diga explicitamente "3 da manhã" / "3h da manhã" / "madrugada" / "03:00".
  - Se o horário de 12h puder corresponder tanto à manhã quanto à tarde dentro do funcionamento da loja (ex: "9 horas" ou "10 horas"), verifique o contexto da conversa e o horário comercial; se houver dúvida real entre manhã e tarde, consulte a disponibilidade e deixe claro o horário no formato HH:MM.

- REGRA DE DOMINGOS:
  - Verifique sempre as regras de funcionamento da loja fornecidas acima antes de responder sobre domingos. Se estiver configurado como aberto aos domingos, utilize os horários de abertura e fechamento específicos de domingo para checar vagas ou orientar o cliente.

- REGRA DE CANCELAMENTO:
  Quando o cliente pedir para cancelar o agendamento, nunca execute a ferramenta com confirm como true de primeira. Responda perguntando se ele tem certeza do cancelamento e aguarde a resposta dele.

FLUXO SEQUENCIAL DE ATENDIMENTO (OBRIGATÓRIO):
1. SERVIÇO:
     ${
       unicoServico
         ? `- A barbearia possui serviço único: "${unicoServico}". Assuma este serviço automaticamente sem perguntar.`
         : `- Se o cliente ainda não informou o serviço, pergunte qual serviço ele deseja agendar (respeitando a regra de horário indisponível: primeiro informe que não está disponível e sugira horários; após ele escolher um sugerido ou perguntar outro horário disponível, pergunte o serviço para validar a duração antes de pedir o nome).`
     }
2. BARBEIRO / PREFERÊNCIA:
     ${
       unicoBarbeiro
         ? `- Barbeiro único: "${unicoBarbeiro}". Assuma este barbeiro automaticamente nos bastidores sem citar o nome dele.`
         : `- Após o cliente informar o serviço, se ele NÃO especificou o barbeiro, pergunte se ele tem preferência por algum profissional (${barbeiroNames.join(", ")}) ou se pode ser com qualquer um.`
     }
3. DATA E HORÁRIO:
- ATENÇÃO: Assim que o cliente citar uma data (ex: amanhã, hoje ou data específica) e um horário, CHAME IMEDIATAMENTE a ferramenta "getAvailableSlots" passando a data correta no formato YYYY-MM-DD (use "${tomorrowStr}" para amanhã ou "${todayStr}" para hoje) e o horário convertido no formato HH:MM (ex: "15:00" para "3 horas" ou "15 horas" à tarde). NUNCA diga que o horário está ocupado sem antes consultar a ferramenta!`;

    const tools: Tool[] = [
      {
        functionDeclarations: [
          {
            name: "scheduleAppointment",
            description:
              "Executa o agendamento após o nome, data e horário estarem definidos.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                barberName: {
                  type: SchemaType.STRING,
                  description: "Nome do barbeiro.",
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
                  description: "Nome do serviço.",
                },
                clientName: {
                  type: SchemaType.STRING,
                  description: "Nome do cliente obtido durante a conversa.",
                },
              },
              required: ["date", "time", "clientName"],
            },
          },
          {
            name: "cancelAppointment",
            description: "Cancela definitivamente o agendamento ativo.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                confirm: {
                  type: SchemaType.BOOLEAN,
                  description: "Confirmação explícita.",
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
                  description: `Data no formato YYYY-MM-DD. (Amanhã é ${tomorrowStr}, Hoje é ${todayStr})`,
                },
                barberName: {
                  type: SchemaType.STRING,
                  description: "Nome do barbeiro (opcional).",
                },
                serviceName: {
                  type: SchemaType.STRING,
                  description: "Nome do serviço (opcional).",
                },
                requestedTime: {
                  type: SchemaType.STRING,
                  description:
                    "Horário específico no formato HH:MM, se houver.",
                },
              },
              required: ["date"],
            },
          },
        ],
      },
    ];

    const fallbackHistory: Content[] = [...history];
    const userMessageText = String(message ?? "");

    let currentChat: ChatSession | null = null;
    let currentModel: GeminiModelName | null = MODELS_TO_TRY[0];
    let lastSlotsFunctionResponse: Record<string, unknown> | null = null;

    let step = await sendMessageAcrossModels({
      chat: currentChat,
      currentModel,
      systemInstruction,
      tools,
      fallbackHistory,
      content: userMessageText,
      maxRetriesPerModel: 2,
    });

    currentChat = step.chat;
    currentModel = step.modelName;
    let responseAi = step.result!.response;
    let calls = responseAi.functionCalls();

    while (calls && calls.length > 0) {
      const call = calls[0];
      let functionResponse: Record<string, unknown> = {};

      if (call.name === "getAvailableSlots") {
        const { date, barberName, serviceName, requestedTime } =
          call.args as unknown as CheckArgs;

        const targetBarber =
          shopData.barbers.find(
            (b) => b.name.toLowerCase() === (barberName || "").toLowerCase(),
          ) ||
          shopData.barbers.find((b) =>
            b.name.toLowerCase().includes((barberName || "").toLowerCase()),
          ) ||
          shopData.barbers[0];

        const targetService =
          shopData.services.find(
            (s) => s.name.toLowerCase() === (serviceName || "").toLowerCase(),
          ) ||
          shopData.services.find((s) =>
            s.name.toLowerCase().includes((serviceName || "").toLowerCase()),
          ) ||
          shopData.services[0];

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
              semVagasNoDia: true,
              reason: slotsResult.closedReason,
              message: slotsResult.closedReason,
              horariosDisponiveis: [],
            };
          } else {
            let sugestoesProximas: string[] = [];
            let isRequestedAvailable = false;
            let formattedRequestedTime: string | null = null;
            let outroBarbeiroDisponivel: string | null = null;

            if (requestedTime) {
              formattedRequestedTime = requestedTime.trim().slice(0, 5);

              const requestedSlot = slotsResult.slots.find(
                (s) => s.time === formattedRequestedTime,
              );

              isRequestedAvailable =
                requestedSlot?.status === "DISPONIVEL" ||
                requestedSlot?.status === "RECOMENDADO";

              if (!isRequestedAvailable && shopData.barbers.length > 1) {
                const outrosBarbeiros = shopData.barbers.filter(
                  (b) => b.id !== targetBarber.id,
                );

                for (const outro of outrosBarbeiros) {
                  const slotsOutro = await getAvailableSlotsForDay(
                    Number(shopId),
                    date,
                    outro.id,
                    targetService.durationMinutes,
                  );

                  const slotOutro = slotsOutro.slots.find(
                    (s) => s.time === formattedRequestedTime,
                  );

                  if (
                    slotOutro?.status === "DISPONIVEL" ||
                    slotOutro?.status === "RECOMENDADO"
                  ) {
                    outroBarbeiroDisponivel = outro.name;
                    break;
                  }
                }
              }

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
              semVagasNoDia: slotsResult.slots.length === 0,
              date,
              barberName: targetBarber.name,
              serviceName: targetService.name,
              horarioSolicitado: formattedRequestedTime,
              horarioSolicitadoDisponivel: formattedRequestedTime
                ? isRequestedAvailable
                : null,
              outroBarbeiroComHorarioLivre: outroBarbeiroDisponivel,
              sugestoesHorariosMaisProximos: sugestoesProximas,
              sugestoesRecomendadasGerais: sugestoesGerais,
              totalSlotsDisponiveis: slotsResult.slots.length,
              horariosDisponiveis: slotsResult.slots.map((s) => s.time),
            };
          }
        }

        lastSlotsFunctionResponse = functionResponse;
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

        const targetService =
          shopData.services.find(
            (s) =>
              s.name.toLowerCase() === (args.serviceName || "").toLowerCase(),
          ) ||
          shopData.services.find((s) =>
            s.name
              .toLowerCase()
              .includes((args.serviceName || "").toLowerCase()),
          ) ||
          shopData.services[0];

        const targetBarber =
          shopData.barbers.find(
            (b) =>
              b.name.toLowerCase() === (args.barberName || "").toLowerCase(),
          ) ||
          shopData.barbers.find((b) =>
            b.name
              .toLowerCase()
              .includes((args.barberName || "").toLowerCase()),
          ) ||
          shopData.barbers[0];

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
            const perguntaSugestao =
              sugestoes.length >= 2 ? "Qual prefere?" : "Pode ser?";
            const ai_response = `O horário das ${args.time} não está disponível. Temos às ${sugestoes.join(" ou ")}. ${perguntaSugestao}`;
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

            const finalClientName = args.clientName?.trim() || "Cliente";

            if (upcomingAppointment) {
              return await tx.appointment.update({
                where: { id: upcomingAppointment.id },
                data: {
                  startTime: startAt,
                  endTime: endTime,
                  barberId: targetBarber.id,
                  serviceId: targetService.id,
                  status: "CONFIRMED",
                  clientName: finalClientName,
                },
              });
            } else {
              return await tx.appointment.create({
                data: {
                  clientName: finalClientName,
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

      const toolResponsePart: Part = {
        functionResponse: {
          name: call.name,
          response: { content: functionResponse },
        },
      };

      const fallbackTextPrompt = `Cliente disse: "${userMessageText}". Resultado da consulta (${call.name}): ${JSON.stringify(functionResponse)}. Responda ao cliente em 1 ou 2 frases curtas seguindo rigorosamente as instruções.`;

      step = await sendMessageAcrossModels({
        chat: currentChat,
        currentModel,
        systemInstruction,
        tools,
        fallbackHistory,
        content: [toolResponsePart],
        fallbackTextContent: fallbackTextPrompt,
        maxRetriesPerModel: 2,
      });

      currentChat = step.chat;
      currentModel = step.modelName;
      responseAi = step.result!.response;
      calls = responseAi.functionCalls();
    }

    const rawText = responseAi.text().trim();
    const finalReply =
      rawText.length > 0
        ? rawText
        : buildFallbackTextFromSlotsResponse(
            lastSlotsFunctionResponse,
            shopData.services.length > 1,
          );

    if (!rawText) {
      console.warn(
        `Modelo ${currentModel} retornou texto vazio. Usando resposta de contingência com dados da agenda.`,
      );
    }

    await prisma.chatMessage.create({
      data: {
        role: "model",
        content: finalReply,
        shopId: Number(shopId),
        clientPhone,
      },
    });

    return NextResponse.json({
      status: "TEXT_RESPONSE",
      ai_response: [finalReply],
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Erro desconhecido";
    console.error("Erro no processamento:", error, errorMessage);

    return NextResponse.json({
      status: "TEXT_RESPONSE",
      ai_response: [
        "Tive um pequeno problema de conexão. Por favor, repita sua última mensagem.",
      ],
    });
  }
}
