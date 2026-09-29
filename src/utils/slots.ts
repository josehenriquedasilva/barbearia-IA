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

const BUFFER_MINUTES = 10;
const MARGEM_ANTECEDENCIA_MINUTOS = 15;

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Retorna os horários disponíveis mais próximos do horário solicitado pelo cliente.
 * - Prioriza horários no mesmo momento ou logo APÓS o solicitado (horários anteriores recebem pequena penalidade).
 * - Evita opções coladas demais entre si.
 * - Retorna no máximo `maxResults` opções (padrão: 2).
 */
export function getClosestSlots(
  slots: Slot[],
  requestedTime: string,
  maxResults = 2,
  minSpacingMinutes = 15,
): string[] {
  const available = slots.filter(
    (s) => s.status === "DISPONIVEL" || s.status === "RECOMENDADO",
  );

  if (available.length === 0) return [];

  const cleanRequestedTime = requestedTime.trim().slice(0, 5);
  const targetMins = timeToMinutes(cleanRequestedTime);

  // Calcula score para cada slot disponível
  const scoredSlots = available.map((slot) => {
    const slotMins = timeToMinutes(slot.time);
    const diff = slotMins - targetMins;

    // Se o horário for ANTES do solicitado, adiciona penalidade de 5 min no score
    // Ex: Se pediu 15:15, o horário 15:20 (diff +5) vence de 15:10 (diff -5, score 5+5=10)
    const penalty = diff < 0 ? 5 : 0;
    const score = Math.abs(diff) + penalty;

    return { slot, slotMins, score };
  });

  // Ordena pelo menor score (melhor opção para o cliente)
  scoredSlots.sort((a, b) => a.score - b.score);

  const selected: typeof scoredSlots = [];

  for (const item of scoredSlots) {
    if (selected.length >= maxResults) break;

    // Garante que não vamos sugerir opções coladas (ex: 15:20 e 15:25)
    const isFarEnough = selected.every(
      (sel) => Math.abs(sel.slotMins - item.slotMins) >= minSpacingMinutes,
    );

    if (isFarEnough) {
      selected.push(item);
    }
  }

  // Retorna em ordem cronológica (ex: ["15:20", "15:40"])
  return selected
    .map((item) => item.slot.time)
    .sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
}

export async function getAvailableSlotsForDay(
  shopId: number,
  dateStr: string,
  barberId: number,
  serviceDuration: number,
): Promise<SlotsResult> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: { closedDays: true, services: true },
  });

  if (!shop) throw new Error("Barbearia não encontrada.");

  const minDbService = shop.services?.length
    ? Math.min(...shop.services.map((s) => s.durationMinutes))
    : 30;
  const minServiceDuration = Math.min(minDbService, serviceDuration);
  const minNeededGap = minServiceDuration + BUFFER_MINUTES;

  const targetDate = new Date(`${dateStr}T12:00:00-03:00`);
  const dayOfWeek = targetDate.getDay();

  const isClosedDay = shop.closedDays?.some((cd) => {
    const cdDateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date(cd.date));
    return cdDateStr === dateStr;
  });

  if (isClosedDay) {
    return {
      isClosed: true,
      closedReason:
        "A barbearia estará FECHADA devido a um feriado ou data especial.",
      slots: [],
    };
  }

  if (dayOfWeek === 0 && shop.isClosedSunday) {
    return {
      isClosed: true,
      closedReason: "A barbearia não abre aos Domingos.",
      slots: [],
    };
  }

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

  const formatter = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  });

  const busyRanges = appointments.map((app) => ({
    start: timeToMinutes(formatter.format(app.startTime)),
    end: timeToMinutes(formatter.format(app.endTime)),
  }));

  const openMin = timeToMinutes(shop.openingTime);
  const closeMin = timeToMinutes(shop.closingTime);
  const totalNeededMinutes = serviceDuration + BUFFER_MINUTES;

  const lunchStartMin =
    shop.hasLunchBreak && shop.lunchStart
      ? timeToMinutes(shop.lunchStart)
      : null;
  const lunchEndMin =
    shop.hasLunchBreak && shop.lunchEnd ? timeToMinutes(shop.lunchEnd) : null;

  const allBlockers = [
    { start: 0, end: openMin },
    { start: closeMin, end: 24 * 60 },
    ...busyRanges,
  ];

  if (lunchStartMin !== null && lunchEndMin !== null) {
    allBlockers.push({ start: lunchStartMin, end: lunchEndMin });
  }

  const rawSlots: Slot[] = [];
  const slotStep = 10;
  let min = openMin;

  while (min <= closeMin) {
    const slotStart = min;
    const serviceOnlyEnd = slotStart + serviceDuration;
    const slotEnd = slotStart + totalNeededMinutes;
    const timeString = minutesToTime(slotStart);

    if (serviceOnlyEnd > closeMin) {
      min += slotStep;
      continue;
    }

    if (lunchStartMin !== null && lunchEndMin !== null) {
      const serviceCollidesLunch =
        slotStart < lunchEndMin && serviceOnlyEnd > lunchStartMin;

      if (serviceCollidesLunch) {
        if (slotStart >= lunchStartMin && slotStart < lunchEndMin) {
          rawSlots.push({ time: timeString, status: "ALMOCO" });
        }
        min += slotStep;
        continue;
      }
    }

    const hasCollision = busyRanges.some(
      (range) => slotStart < range.end && slotEnd > range.start,
    );

    if (hasCollision) {
      rawSlots.push({ time: timeString, status: "OCUPADO" });
      min += slotStep;
      continue;
    }

    const isAnchoredStart = allBlockers.some(
      (b) => b.end === slotStart && b.end !== 0,
    );
    const isAnchoredEnd = allBlockers.some(
      (b) =>
        (b.start === slotEnd || b.start === serviceOnlyEnd) &&
        b.start !== 24 * 60,
    );

    const isRecommended = isAnchoredStart || isAnchoredEnd;

    rawSlots.push({
      time: timeString,
      status: isRecommended ? "RECOMENDADO" : "DISPONIVEL",
      reason: isRecommended ? "Encaixe ideal sem lacunas" : undefined,
    });

    min += slotStep;
  }

  const cleanSlots = rawSlots.filter((slot) => {
    if (slot.status === "OCUPADO" || slot.status === "ALMOCO") return false;
    if (slot.status === "RECOMENDADO") return true;

    const slotStartMins = timeToMinutes(slot.time);
    const serviceOnlyEndMins = slotStartMins + serviceDuration;
    const slotEndMins = slotStartMins + totalNeededMinutes;

    const prevBoundary = allBlockers
      .filter((b) => b.end <= slotStartMins)
      .reduce((max, b) => Math.max(max, b.end), 0);

    const nextBoundary = allBlockers
      .filter((b) => b.start >= serviceOnlyEndMins)
      .reduce((minVal, b) => Math.min(minVal, b.start), 24 * 60);

    const gapBefore = slotStartMins - prevBoundary;

    const effectiveEnd =
      slotEndMins > nextBoundary && serviceOnlyEndMins <= nextBoundary
        ? nextBoundary
        : slotEndMins;
    const gapAfter = nextBoundary - effectiveEnd;

    const isBeforeValid = gapBefore === 0 || gapBefore >= minNeededGap;
    const isAfterValid = gapAfter === 0 || gapAfter >= minNeededGap;

    return isBeforeValid && isAfterValid;
  });

  const now = new Date();
  const todayInSaoPaulo = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(now);

  const isToday = dateStr === todayInSaoPaulo;

  let currentMinutes = 0;
  if (isToday) {
    const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Sao_Paulo",
    });
    currentMinutes = timeToMinutes(timeFormatter.format(now));
  }

  const finalSlots = cleanSlots.filter((slot) => {
    if (!isToday) return true;
    const slotStartMins = timeToMinutes(slot.time);
    return slotStartMins >= currentMinutes + MARGEM_ANTECEDENCIA_MINUTOS;
  });

  return {
    isClosed: false,
    slots: finalSlots,
  };
}