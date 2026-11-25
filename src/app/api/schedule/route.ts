import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAvailableSlotsForDay } from "@/utils/slots";
import {
  SendWhatsAppPayloadOptions,
  WhatsAppListRow,
  WhatsAppReplyButton,
} from "@/lib/whatsApp";

export const dynamic = "force-dynamic";

type FlowStep =
  | "ACTIVE_APPOINTMENT_MENU"
  | "CONFIRM_CANCEL"
  | "SELECT_SERVICE"
  | "SELECT_BARBER"
  | "SELECT_DATE"
  | "SELECT_PERIOD"
  | "SELECT_TIME"
  | "INPUT_NAME";

interface FlowState {
  step: FlowStep;
  serviceId?: number;
  barberId?: number;
  date?: string;
  period?: "MANHA" | "TARDE" | "NOITE";
  time?: string;
  clientName?: string;
  isRescheduling?: boolean;
}

interface OutgoingMessage {
  text: string;
  buttons?: SendWhatsAppPayloadOptions["buttons"];
  list?: SendWhatsAppPayloadOptions["list"];
  footer?: string;
}

const TZ = "America/Sao_Paulo";

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function pickSpacedTimes(
  times: string[],
  stepMinutes: number,
  maxCount = 10,
): string[] {
  if (times.length === 0) return [];
  const safeStep = Math.max(10, stepMinutes);

  const picked: string[] = [times[0]];
  let lastMins = timeToMinutes(times[0]);

  for (let i = 1; i < times.length; i++) {
    if (picked.length >= maxCount) break;
    const currentMins = timeToMinutes(times[i]);
    if (currentMins - lastMins >= safeStep) {
      picked.push(times[i]);
      lastMins = currentMins;
    }
  }

  return picked;
}

function getDateStrOffset(daysOffset: number): string {
  const now = new Date();
  const target = new Date(now.getTime() + daysOffset * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(target);
}

function formatDateLabel(
  dateStr: string,
  indexOffset?: number,
): {
  title: string;
  description: string;
} {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

  const weekday = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    timeZone: TZ,
  }).format(dateObj);

  const capitalizedWeekday =
    weekday.charAt(0).toUpperCase() + weekday.slice(1).split("-")[0];
  const shortDate = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;

  if (indexOffset === 0) {
    return { title: `Hoje (${shortDate})`, description: capitalizedWeekday };
  }
  if (indexOffset === 1) {
    return { title: `Amanhã (${shortDate})`, description: capitalizedWeekday };
  }
  return {
    title: `${capitalizedWeekday} (${shortDate})`.slice(0, 24),
    description: `${shortDate}/${y}`,
  };
}

function getUpcomingOpenDates(
  shopData: {
    isClosedSunday: boolean;
    closedDays: Array<{ date: string }>;
  },
  maxDays: number = 7,
): Array<{ dateStr: string; title: string; description: string }> {
  const closedSet = new Set(shopData.closedDays.map((c) => c.date));
  const results: Array<{
    dateStr: string;
    title: string;
    description: string;
  }> = [];

  for (let offset = 0; offset < 21 && results.length < maxDays; offset++) {
    const dateStr = getDateStrOffset(offset);
    if (closedSet.has(dateStr)) continue;

    const [y, m, d] = dateStr.split("-").map(Number);
    const utcDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const isSunday = utcDate.getUTCDay() === 0;

    if (isSunday && shopData.isClosedSunday) continue;

    const { title, description } = formatDateLabel(dateStr, offset);
    results.push({ dateStr, title, description });
  }

  return results;
}

function classifySlotPeriod(time: string): "MANHA" | "TARDE" | "NOITE" {
  const hour = Number(time.split(":")[0] || "0");
  if (hour < 12) return "MANHA";
  if (hour < 18) return "TARDE";
  return "NOITE";
}

function buildSingleSlotMessage(params: {
  selectedPeriod?: "MANHA" | "TARDE" | "NOITE";
  closingTime: string;
  totalDaySlots: number;
}): string {
  const { selectedPeriod, closingTime, totalDaySlots } = params;

  if (selectedPeriod === "NOITE") {
    return `Só temos esse horário disponível à noite antes do fechamento às ${closingTime}. Escolha para agendar:`;
  }

  if (selectedPeriod === "MANHA") {
    return "Só temos esse horário disponível no turno da manhã. Escolha para agendar:";
  }

  if (selectedPeriod === "TARDE") {
    return "Só temos esse horário disponível no turno da tarde. Escolha para agendar:";
  }

  if (totalDaySlots === 1) {
    return `Só temos esse horário disponível nesse dia antes do fechamento às ${closingTime}. Escolha para agendar:`;
  }

  return "Só temos esse horário disponível no momento. Escolha para agendar:";
}

function buildChoiceMessage(params: {
  text: string;
  buttonText: string;
  sectionTitle: string;
  options: Array<{ id: string; title: string; description?: string }>;
  footer?: string;
}): OutgoingMessage {
  const { text, buttonText, sectionTitle, options, footer } = params;

  if (options.length <= 3) {
    const buttons: WhatsAppReplyButton[] = options.map((opt) => ({
      type: "reply",
      id: opt.id,
      displayText: opt.title.slice(0, 20),
    }));
    return { text, buttons, footer };
  }

  const rows: WhatsAppListRow[] = options.slice(0, 10).map((opt) => ({
    id: opt.id,
    title: opt.title.slice(0, 24),
    ...(opt.description ? { description: opt.description.slice(0, 72) } : {}),
  }));

  return {
    text,
    list: {
      buttonText: buttonText.slice(0, 20),
      sections: [{ title: sectionTitle.slice(0, 24), rows }],
    },
    footer,
  };
}

async function loadState(
  shopId: number,
  clientPhone: string,
): Promise<FlowState | null> {
  const stateMsg = await prisma.chatMessage.findFirst({
    where: { shopId, clientPhone, role: "state" },
    orderBy: { id: "desc" },
  });

  if (!stateMsg) return null;

  try {
    return JSON.parse(stateMsg.content) as FlowState;
  } catch {
    return null;
  }
}

async function saveStateAndReply(params: {
  shopId: number;
  clientPhone: string;
  state: FlowState;
  reply: OutgoingMessage;
  status?: string;
}) {
  const {
    shopId,
    clientPhone,
    state,
    reply,
    status = "INTERACTIVE_RESPONSE",
  } = params;

  await prisma.chatMessage.deleteMany({
    where: { shopId, clientPhone, role: "state" },
  });

  await prisma.chatMessage.create({
    data: {
      role: "state",
      content: JSON.stringify(state),
      shopId,
      clientPhone,
      processed: true,
    },
  });

  await prisma.chatMessage.create({
    data: {
      role: "model",
      content: reply.text,
      shopId,
      clientPhone,
      processed: true,
    },
  });

  return NextResponse.json({
    status,
    messages: [reply],
    ai_response: [reply.text],
  });
}

async function clearSessionAndReply(params: {
  shopId: number;
  clientPhone: string;
  text: string;
  status?: string;
  details?: unknown;
}) {
  const { shopId, clientPhone, text, status = "SUCCESS", details } = params;

  await prisma.chatMessage.deleteMany({
    where: { shopId, clientPhone },
  });

  const reply: OutgoingMessage = { text };

  return NextResponse.json({
    status,
    messages: [reply],
    ai_response: [text],
    ...(details ? { details } : {}),
  });
}

export async function POST(request: Request) {
  try {
    const {
      message,
      interactiveId,
      shopId,
      clientPhone: rawClientPhone,
    } = await request.json();

    if (!shopId) {
      return NextResponse.json(
        { message: "ID da barbearia não fornecido." },
        { status: 400 },
      );
    }

    const numericShopId = Number(shopId);
    const clientPhone = rawClientPhone
      ? String(rawClientPhone).replace(/^55/, "")
      : "";
    const rawInput = String(message ?? "").trim();
    const normInput = normalizeText(rawInput);
    const normId = normalizeText(String(interactiveId ?? ""));

    const shopData = await prisma.shop.findUnique({
      where: { id: numericShopId },
      include: {
        barbers: { select: { id: true, name: true }, orderBy: { id: "asc" } },
        services: {
          where: { active: true },
          select: { id: true, name: true, durationMinutes: true, price: true },
          orderBy: { id: "asc" },
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

    if (shopData.services.length === 0 || shopData.barbers.length === 0) {
      return clearSessionAndReply({
        shopId: numericShopId,
        clientPhone,
        text: "No momento esta barbearia não possui serviços ou profissionais ativos para agendamento.",
        status: "ERROR",
      });
    }

    const now = new Date();
    const upcomingAppointment = await prisma.appointment.findFirst({
      where: {
        clientPhone,
        shopId: numericShopId,
        status: "CONFIRMED",
        endTime: { gt: now },
      },
      include: { barber: true, service: true },
      orderBy: { startTime: "asc" },
    });

    const finalizeBooking = async (params: {
      currentState: FlowState;
      dateStr: string;
      timeStr: string;
      clientName: string;
    }) => {
      const { currentState, dateStr, timeStr, clientName } = params;

      const targetService =
        shopData.services.find((s) => s.id === currentState.serviceId) ||
        shopData.services[0];
      const targetBarber =
        shopData.barbers.find((b) => b.id === currentState.barberId) ||
        shopData.barbers[0];

      const slotsResult = await getAvailableSlotsForDay(
        numericShopId,
        dateStr,
        targetBarber.id,
        targetService.durationMinutes,
      );

      const chosenSlot = slotsResult.slots.find((s) => s.time === timeStr);
      if (slotsResult.isClosed || !chosenSlot) {
        return promptTimeOrPeriodForDate(
          { ...currentState, time: undefined, period: undefined },
          dateStr,
        );
      }

      const startAt = new Date(`${dateStr}T${timeStr}:00-03:00`);
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
                clientName,
              },
            });
          }

          return await tx.appointment.create({
            data: {
              clientName,
              clientPhone,
              shopId: shopData.id,
              barberId: targetBarber.id,
              serviceId: targetService.id,
              startTime: startAt,
              endTime: endTime,
            },
          });
        });

        const dateFormatted = dateStr.split("-").reverse().join("/");
        const barberInfo =
          shopData.barbers.length > 1 ? ` com ${targetBarber.name}` : "";
        const baseSuccess = upcomingAppointment
          ? "Seu horário foi alterado com sucesso!"
          : "Agendamento realizado com sucesso!";

        return clearSessionAndReply({
          shopId: numericShopId,
          clientPhone,
          text: `${baseSuccess}\nServiço: ${targetService.name}${barberInfo}\nData: ${dateFormatted} às ${timeStr}\nNome: ${clientName}`,
          status: "SUCCESS",
          details: finalAppointment,
        });
      } catch (txError: unknown) {
        const errorMessage = txError instanceof Error ? txError.message : "";
        if (errorMessage === "TIME_SLOT_TAKEN") {
          return promptTimeOrPeriodForDate(
            { ...currentState, time: undefined, period: undefined },
            dateStr,
          );
        }
        throw txError;
      }
    };

    const isRestartCommand =
      normId === "restart" ||
      normInput === "menu" ||
      normInput === "inicio" ||
      normInput === "recomecar" ||
      normInput === "voltar ao inicio";

    const state = isRestartCommand
      ? null
      : await loadState(numericShopId, clientPhone);

    const promptNextAfterServiceAndBarber = async (
      nextState: FlowState,
      greetingPrefix = "",
    ) => {
      if (!nextState.serviceId) {
        if (shopData.services.length === 1) {
          nextState.serviceId = shopData.services[0].id;
        } else {
          const reply = buildChoiceMessage({
            text: `${greetingPrefix}Qual serviço você deseja agendar?`,
            buttonText: "Ver serviços",
            sectionTitle: "Serviços",
            options: shopData.services.map((s) => ({
              id: `srv_${s.id}`,
              title: s.name,
            })),
          });
          return saveStateAndReply({
            shopId: numericShopId,
            clientPhone,
            state: { ...nextState, step: "SELECT_SERVICE" },
            reply,
          });
        }
      }

      if (!nextState.barberId) {
        if (shopData.barbers.length === 1) {
          nextState.barberId = shopData.barbers[0].id;
        } else {
          const reply = buildChoiceMessage({
            text: `${greetingPrefix}Com qual profissional você prefere agendar?`,
            buttonText: "Ver barbeiros",
            sectionTitle: "Profissionais",
            options: [
              ...shopData.barbers.map((b) => ({
                id: `brb_${b.id}`,
                title: b.name,
              })),
              {
                id: "brb_any",
                title: "Qualquer um",
                description: "Primeiro horário livre",
              },
            ].slice(0, 10),
          });
          return saveStateAndReply({
            shopId: numericShopId,
            clientPhone,
            state: { ...nextState, step: "SELECT_BARBER" },
            reply,
          });
        }
      }

      const openDates = getUpcomingOpenDates(shopData, 7);
      if (openDates.length === 0) {
        return clearSessionAndReply({
          shopId: numericShopId,
          clientPhone,
          text: "Não encontramos datas abertas nos próximos dias.",
          status: "CLOSED",
        });
      }

      const reply = buildChoiceMessage({
        text: `${greetingPrefix}Para qual dia você deseja agendar?`,
        buttonText: "Escolher dia",
        sectionTitle: "Dias disponíveis",
        options: openDates.map((d) => ({
          id: `date_${d.dateStr}`,
          title: d.title,
          description: d.description,
        })),
      });

      return saveStateAndReply({
        shopId: numericShopId,
        clientPhone,
        state: { ...nextState, step: "SELECT_DATE" },
        reply,
      });
    };

    const promptTimeOrPeriodForDate = async (
      nextState: FlowState,
      dateStr: string,
      selectedPeriod?: "MANHA" | "TARDE" | "NOITE",
    ) => {
      const service =
        shopData.services.find((s) => s.id === nextState.serviceId) ||
        shopData.services[0];
      const barber =
        shopData.barbers.find((b) => b.id === nextState.barberId) ||
        shopData.barbers[0];

      const slotsResult = await getAvailableSlotsForDay(
        numericShopId,
        dateStr,
        barber.id,
        service.durationMinutes,
      );

      if (slotsResult.isClosed || slotsResult.slots.length === 0) {
        const openDates = getUpcomingOpenDates(shopData, 7).filter(
          (d) => d.dateStr !== dateStr,
        );
        const reply = buildChoiceMessage({
          text: "Não temos horários disponíveis nessa data para o serviço escolhido. Escolha outro dia:",
          buttonText: "Escolher outro dia",
          sectionTitle: "Dias disponíveis",
          options: openDates.map((d) => ({
            id: `date_${d.dateStr}`,
            title: d.title,
            description: d.description,
          })),
        });
        return saveStateAndReply({
          shopId: numericShopId,
          clientPhone,
          state: {
            ...nextState,
            date: undefined,
            period: undefined,
            step: "SELECT_DATE",
          },
          reply,
        });
      }

      const stepMinutes = service.durationMinutes + 10;
      const allTimes = slotsResult.slots.map((s) => s.time);
      const spacedAllTimes = pickSpacedTimes(allTimes, stepMinutes, 30);

      if (spacedAllTimes.length > 10 && !selectedPeriod) {
        const morningTimes = spacedAllTimes.filter(
          (t) => classifySlotPeriod(t) === "MANHA",
        );
        const afternoonTimes = spacedAllTimes.filter(
          (t) => classifySlotPeriod(t) === "TARDE",
        );
        const nightTimes = spacedAllTimes.filter(
          (t) => classifySlotPeriod(t) === "NOITE",
        );

        const periodButtons: WhatsAppReplyButton[] = [];
        if (morningTimes.length > 0) {
          periodButtons.push({
            type: "reply",
            id: "period_MANHA",
            displayText: "Manhã",
          });
        }
        if (afternoonTimes.length > 0) {
          periodButtons.push({
            type: "reply",
            id: "period_TARDE",
            displayText: "Tarde",
          });
        }
        if (nightTimes.length > 0) {
          periodButtons.push({
            type: "reply",
            id: "period_NOITE",
            displayText: "Noite",
          });
        }

        if (periodButtons.length > 1) {
          return saveStateAndReply({
            shopId: numericShopId,
            clientPhone,
            state: {
              ...nextState,
              date: dateStr,
              period: undefined,
              step: "SELECT_PERIOD",
            },
            reply: {
              text: "Temos vários horários livres nesse dia. Qual turno você prefere?",
              buttons: periodButtons,
            },
          });
        }
      }

      const filteredTimes = selectedPeriod
        ? spacedAllTimes.filter((t) => classifySlotPeriod(t) === selectedPeriod)
        : spacedAllTimes;

      const timesToShow = (
        filteredTimes.length > 0 ? filteredTimes : spacedAllTimes
      ).slice(0, 10);

      const promptText =
        timesToShow.length === 1
          ? buildSingleSlotMessage({
              selectedPeriod,
              closingTime: shopData.closingTime,
              totalDaySlots: spacedAllTimes.length,
            })
          : "Escolha o melhor horário disponível:";

      const reply = buildChoiceMessage({
        text: promptText,
        buttonText: "Ver horários",
        sectionTitle: "Horários livres",
        options: timesToShow.map((time) => ({
          id: `time_${time}`,
          title: time,
        })),
      });

      return saveStateAndReply({
        shopId: numericShopId,
        clientPhone,
        state: {
          ...nextState,
          date: dateStr,
          period: selectedPeriod,
          step: "SELECT_TIME",
        },
        reply,
      });
    };

    if (!state) {
      if (upcomingAppointment) {
        const dateStr = upcomingAppointment.startTime.toLocaleDateString(
          "pt-BR",
          { timeZone: TZ },
        );
        const timeStr = upcomingAppointment.startTime.toLocaleTimeString(
          "pt-BR",
          { hour: "2-digit", minute: "2-digit", timeZone: TZ },
        );
        const barberDetail =
          shopData.barbers.length > 1
            ? ` com ${upcomingAppointment.barber.name}`
            : "";

        return saveStateAndReply({
          shopId: numericShopId,
          clientPhone,
          state: { step: "ACTIVE_APPOINTMENT_MENU" },
          reply: {
            text: `Olá! Você já tem um agendamento confirmado para ${dateStr} às ${timeStr} (${upcomingAppointment.service.name}${barberDetail}). O que deseja fazer?`,
            buttons: [
              { type: "reply", id: "apt_keep", displayText: "Manter horário" },
              { type: "reply", id: "apt_reschedule", displayText: "Remarcar" },
              { type: "reply", id: "apt_cancel", displayText: "Cancelar" },
            ],
          },
        });
      }

      return promptNextAfterServiceAndBarber(
        { step: "SELECT_SERVICE" },
        `Olá! Bem-vindo à ${shopData.name}. `,
      );
    }

    if (state.step === "ACTIVE_APPOINTMENT_MENU") {
      if (normId === "apt_keep" || normInput.includes("manter")) {
        return clearSessionAndReply({
          shopId: numericShopId,
          clientPhone,
          text: "Perfeito! Seu agendamento continua confirmado.",
        });
      }

      if (normId === "apt_cancel" || normInput.includes("cancelar")) {
        return saveStateAndReply({
          shopId: numericShopId,
          clientPhone,
          state: { step: "CONFIRM_CANCEL" },
          reply: {
            text: "Tem certeza que deseja cancelar seu agendamento?",
            buttons: [
              {
                type: "reply",
                id: "cancel_yes",
                displayText: "Sim, cancelar",
              },
              { type: "reply", id: "cancel_no", displayText: "Não, manter" },
            ],
          },
        });
      }

      if (normId === "apt_reschedule" || normInput.includes("remarcar")) {
        return promptNextAfterServiceAndBarber({
          step: "SELECT_SERVICE",
          isRescheduling: true,
          clientName: upcomingAppointment?.clientName,
        });
      }

      return saveStateAndReply({
        shopId: numericShopId,
        clientPhone,
        state,
        reply: {
          text: "Escolha uma das opções abaixo para o seu agendamento:",
          buttons: [
            { type: "reply", id: "apt_keep", displayText: "Manter horário" },
            { type: "reply", id: "apt_reschedule", displayText: "Remarcar" },
            { type: "reply", id: "apt_cancel", displayText: "Cancelar" },
          ],
        },
      });
    }

    if (state.step === "CONFIRM_CANCEL") {
      if (
        normId === "cancel_yes" ||
        normInput === "sim" ||
        normInput.includes("sim, cancelar")
      ) {
        if (!upcomingAppointment) {
          return clearSessionAndReply({
            shopId: numericShopId,
            clientPhone,
            text: "Você não possui nenhum agendamento ativo no momento.",
            status: "ERROR",
          });
        }

        await prisma.appointment.update({
          where: { id: upcomingAppointment.id },
          data: { status: "CANCELED" },
        });

        return clearSessionAndReply({
          shopId: numericShopId,
          clientPhone,
          text: "Seu agendamento foi cancelado com sucesso.",
        });
      }

      return clearSessionAndReply({
        shopId: numericShopId,
        clientPhone,
        text: "Tudo certo, seu agendamento foi mantido.",
      });
    }

    if (state.step === "SELECT_SERVICE") {
      const matchedService =
        shopData.services.find((s) => normId === `srv_${s.id}`) ||
        shopData.services.find((s) => normalizeText(s.name) === normInput) ||
        shopData.services.find((s) =>
          normalizeText(s.name).includes(normInput),
        );

      if (!matchedService) {
        return promptNextAfterServiceAndBarber(
          { ...state, serviceId: undefined },
          "Opção inválida. ",
        );
      }

      return promptNextAfterServiceAndBarber({
        ...state,
        serviceId: matchedService.id,
      });
    }

    if (state.step === "SELECT_BARBER") {
      if (normId === "brb_any" || normInput.includes("qualquer")) {
        return promptNextAfterServiceAndBarber({
          ...state,
          barberId: shopData.barbers[0].id,
        });
      }

      const matchedBarber =
        shopData.barbers.find((b) => normId === `brb_${b.id}`) ||
        shopData.barbers.find((b) => normalizeText(b.name) === normInput) ||
        shopData.barbers.find((b) => normalizeText(b.name).includes(normInput));

      if (!matchedBarber) {
        return promptNextAfterServiceAndBarber(
          { ...state, barberId: undefined },
          "Profissional inválido. ",
        );
      }

      return promptNextAfterServiceAndBarber({
        ...state,
        barberId: matchedBarber.id,
      });
    }

    if (state.step === "SELECT_DATE") {
      const openDates = getUpcomingOpenDates(shopData, 7);
      const matchedDate =
        openDates.find((d) => normId === `date_${d.dateStr}`) ||
        openDates.find((d) => normalizeText(d.title) === normInput) ||
        openDates.find((d) =>
          normInput.includes(d.title.split("(")[1]?.replace(")", "") || "___"),
        ) ||
        (normInput.includes("hoje") ? openDates[0] : undefined) ||
        (normInput.includes("amanha")
          ? openDates.find((d) => d.dateStr === getDateStrOffset(1))
          : undefined);

      if (!matchedDate) {
        const reply = buildChoiceMessage({
          text: "Data inválida. Selecione um dos dias disponíveis:",
          buttonText: "Escolher dia",
          sectionTitle: "Dias disponíveis",
          options: openDates.map((d) => ({
            id: `date_${d.dateStr}`,
            title: d.title,
            description: d.description,
          })),
        });
        return saveStateAndReply({
          shopId: numericShopId,
          clientPhone,
          state,
          reply,
        });
      }

      return promptTimeOrPeriodForDate(state, matchedDate.dateStr);
    }

    if (state.step === "SELECT_PERIOD" && state.date) {
      let chosenPeriod: "MANHA" | "TARDE" | "NOITE" | undefined;
      if (normId === "period_manha" || normInput.includes("manha")) {
        chosenPeriod = "MANHA";
      } else if (normId === "period_tarde" || normInput.includes("tarde")) {
        chosenPeriod = "TARDE";
      } else if (normId === "period_noite" || normInput.includes("noite")) {
        chosenPeriod = "NOITE";
      }

      if (!chosenPeriod) {
        return promptTimeOrPeriodForDate(state, state.date);
      }

      return promptTimeOrPeriodForDate(state, state.date, chosenPeriod);
    }

    if (state.step === "SELECT_TIME" && state.date) {
      const timeCandidate = normId.startsWith("time_")
        ? normId.replace("time_", "")
        : rawInput.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)?.[0] || "";

      const formattedTime =
        timeCandidate.length === 4 ? `0${timeCandidate}` : timeCandidate;

      if (!/^\d{2}:\d{2}$/.test(formattedTime)) {
        return promptTimeOrPeriodForDate(state, state.date, state.period);
      }

      if (state.clientName && state.clientName.trim().length > 0) {
        return finalizeBooking({
          currentState: { ...state, time: formattedTime },
          dateStr: state.date,
          timeStr: formattedTime,
          clientName: state.clientName.trim(),
        });
      }

      return saveStateAndReply({
        shopId: numericShopId,
        clientPhone,
        state: { ...state, time: formattedTime, step: "INPUT_NAME" },
        reply: {
          text: "Qual é o seu nome para concluir o agendamento?",
        },
      });
    }

    if (state.step === "INPUT_NAME" && state.date && state.time) {
      if (rawInput.length < 2) {
        return saveStateAndReply({
          shopId: numericShopId,
          clientPhone,
          state,
          reply: {
            text: "Por favor, digite seu nome para concluir o agendamento.",
          },
        });
      }

      const cleanName = rawInput.slice(0, 60);
      return finalizeBooking({
        currentState: { ...state, clientName: cleanName },
        dateStr: state.date,
        timeStr: state.time,
        clientName: cleanName,
      });
    }

    return promptNextAfterServiceAndBarber({ step: "SELECT_SERVICE" });
  } catch (error: unknown) {
    console.error("Erro no processamento do fluxo:", error);
    return NextResponse.json({
      status: "TEXT_RESPONSE",
      messages: [
        {
          text: "Tive um pequeno problema técnico. Por favor, envie uma mensagem novamente para continuar.",
        },
      ],
      ai_response: [
        "Tive um pequeno problema técnico. Por favor, envie uma mensagem novamente para continuar.",
      ],
    });
  }
}
