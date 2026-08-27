import prisma from "@/lib/db";

export interface Slot {
  time: string;

  status: "DISPONIVEL" | "OCUPADO" | "ALMOCO" | "RECOMENDADO";

  reason?: string;
}

export interface SlotsResult {
  isClosed: boolean;

  closedReason?: string;

  slots: Slot[];
}

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);

  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);

  const m = mins % 60;

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export async function getAvailableSlotsForDay(
  shopId: number,

  dateStr: string, // Esperado no formato "YYYY-MM-DD"

  barberId: number,

  serviceDuration: number,
): Promise<SlotsResult> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },

    include: { closedDays: true },
  });

  if (!shop) throw new Error("Barbearia não encontrada.");

  // -------------------------------------------------------------

  // 1. CHECAGEM DE FERIADOS, DOMINGOS E FOLGAS

  // -------------------------------------------------------------

  const [year, month, day] = dateStr.split("-").map(Number);

  const targetDate = new Date(year, month - 1, day);

  const dayOfWeek = targetDate.getDay(); // 0 = Domingo, 1 = Segunda, etc.

  // A) Feriados/Datas Fechadas específicas no Banco

  const isClosedDay = shop.closedDays?.some((cd) => {
    const cdIso = new Date(cd.date).toISOString().split("T")[0];

    return cdIso === dateStr;
  });

  if (isClosedDay) {
    return {
      isClosed: true,

      closedReason:
        "A barbearia estará FECHADA devido a um feriado ou data especial.",

      slots: [],
    };
  }

  // B) Domingo Fechado

  if (dayOfWeek === 0 && shop.isClosedSunday) {
    return {
      isClosed: true,

      closedReason: "A barbearia não abre aos Domingos.",

      slots: [],
    };
  }

  // C) Dia de Folga Semanal Fixo

  const diasSemanaMap: Record<string, number> = {
    domingo: 0,

    segunda: 1,

    "segunda-feira": 1,

    terca: 2,

    "terça-feira": 2,

    quarta: 3,

    "quarta-feira": 3,

    quinta: 4,

    "quinta-feira": 4,

    sexta: 5,

    "sexta-feira": 5,

    sabado: 6,

    sábado: 6,
  };

  if (
    shop.hasDayOff &&
    shop.dayOff &&
    dayOfWeek === diasSemanaMap[shop.dayOff.toLowerCase()]
  ) {
    return {
      isClosed: true,

      closedReason: `A barbearia não abre às ${shop.dayOff}s (dia de folga fixo).`,

      slots: [],
    };
  }

  // -------------------------------------------------------------

  // 2. BUSCA DE AGENDAMENTOS EXISTENTES

  // -------------------------------------------------------------

  const startOfDay = new Date(`${dateStr}T00:00:00-03:00`);

  const endOfDay = new Date(`${dateStr}T23:59:59-03:00`);

  const appointments = await prisma.appointment.findMany({
    where: {
      shopId,

      barberId,

      status: "CONFIRMED",

      startTime: { gte: startOfDay, lte: endOfDay },
    },

    orderBy: { startTime: "asc" },
  });

  const busyRanges = appointments.map((app) => {
    // Formata com Intl para evitar bugs de locale/Node em servidores UTC

    const formatter = new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",

      minute: "2-digit",

      hour12: false,

      timeZone: "America/Sao_Paulo",
    });

    const startLocal = formatter.format(app.startTime);

    const endLocal = formatter.format(app.endTime);

    return { start: timeToMinutes(startLocal), end: timeToMinutes(endLocal) };
  });

  // -------------------------------------------------------------

  // 3. CÁLCULO DA GRADE DE HORÁRIOS (SLOTS)

  // -------------------------------------------------------------

  const openMin = timeToMinutes(shop.openingTime);

  const closeMin = timeToMinutes(shop.closingTime);

  const maxCloseMin = closeMin + 20; // Tolerância máxima de término

  const lunchStartMin =
    shop.hasLunchBreak && shop.lunchStart
      ? timeToMinutes(shop.lunchStart)
      : null;

  const lunchEndMin =
    shop.hasLunchBreak && shop.lunchEnd ? timeToMinutes(shop.lunchEnd) : null;

  const slots: Slot[] = [];

  const interval = 15; // Intervalo de passo entre opções de horários (ex: 15 min)

  let min = openMin;

  while (min + serviceDuration <= maxCloseMin) {
    const slotStart = min;

    const slotEnd = min + serviceDuration;

    const timeString = minutesToTime(slotStart);

    // A) Checagem de Almoço

    if (lunchStartMin !== null && lunchEndMin !== null) {
      if (slotStart < lunchEndMin && slotEnd > lunchStartMin) {
        if (slotStart >= lunchStartMin && slotStart < lunchEndMin) {
          slots.push({ time: timeString, status: "ALMOCO" });

          min = lunchEndMin; // ✅ Pula exatamente para o FIM do almoço

          continue;
        } else {
          // Começa antes do almoço, mas invade o horário de almoço

          slots.push({ time: timeString, status: "OCUPADO" });

          min += interval;

          continue;
        }
      }
    }

    // B) Checagem de Conflito com Clientes Agendados

    const conflictingApp = busyRanges.find(
      (range) => slotStart < range.end && slotEnd > range.start,
    );

    if (conflictingApp) {
      slots.push({ time: timeString, status: "OCUPADO" });

      min = conflictingApp.end; // Pula para o fim do agendamento

      continue;
    }

    // C) Sugestão de Horários Recomendados (Otimização de Agenda)

    const isBeginningOfDay = slotStart === openMin;

    const isAfterLunch = lunchEndMin !== null && slotStart === lunchEndMin;

    const isBackToBackWithPrevious = busyRanges.some(
      (range) => range.end === slotStart,
    );

    const isBackToBackWithNext = busyRanges.some(
      (range) => range.start === slotEnd, // ✅ Corrigido (sem + interval)
    );

    if (
      isBeginningOfDay ||
      isAfterLunch ||
      isBackToBackWithPrevious ||
      isBackToBackWithNext
    ) {
      slots.push({
        time: timeString,

        status: "RECOMENDADO",

        reason: "Otimiza a sequência de atendimentos da barbearia",
      });
    } else {
      slots.push({ time: timeString, status: "DISPONIVEL" });
    }

    min += interval;
  }

  return {
    isClosed: false,

    slots,
  };
}
