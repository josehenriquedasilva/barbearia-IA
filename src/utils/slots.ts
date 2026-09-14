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

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function getClosestSlots(
  slots: Slot[],
  requestedTime: string,
  maxDiffMinutes = 120,
): string[] {
  const available = slots.filter(
    (s) => s.status === "DISPONIVEL" || s.status === "RECOMENDADO",
  );

  if (available.length === 0) return [];

  // Normaliza para formato HH:MM (ex: "15:00:00" -> "15:00")
  const cleanRequestedTime = requestedTime.trim().slice(0, 5);
  const targetMins = timeToMinutes(cleanRequestedTime);

  // 1. Filtra apenas os horários dentro da janela (ex: até 2 horas antes ou depois)
  const slotsInWindow = available.filter(
    (s) => Math.abs(timeToMinutes(s.time) - targetMins) <= maxDiffMinutes,
  );

  // Se houver horários dentro da janela, usa eles. Se não houver nenhum, cai no fallback do dia.
  const pool = slotsInWindow.length > 0 ? slotsInWindow : available;

  const beforeSlots = pool
    .filter((s) => timeToMinutes(s.time) < targetMins)
    .sort((a, b) => timeToMinutes(b.time) - timeToMinutes(a.time)); // Do mais próximo ao mais distante

  const afterSlots = pool
    .filter((s) => timeToMinutes(s.time) > targetMins)
    .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time)); // Do mais próximo ao mais distante

  let selected: Slot[] = [];

  if (beforeSlots.length > 0 && afterSlots.length > 0) {
    // Pega 1 opção imediatamente antes e 1 imediatamente depois dentro da janela
    selected = [beforeSlots[0], afterSlots[0]];
  } else if (beforeSlots.length > 0) {
    // Apenas opções anteriores mais próximas
    selected = beforeSlots.slice(0, 2);
  } else if (afterSlots.length > 0) {
    // Apenas opções posteriores mais próximas
    selected = afterSlots.slice(0, 2);
  }

  // Ordena cronologicamente para exibição (ex: "14:30 e 15:30")
  return selected
    .map((s) => s.time)
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

  const [year, month, day] = dateStr.split("-").map(Number);
  const targetDate = new Date(year, month - 1, day);
  const dayOfWeek = targetDate.getDay();

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

    const isBeforeValid =
      gapBefore === 0 ||
      (gapBefore >= minNeededGap && gapBefore % minNeededGap === 0);

    const isAfterValid =
      gapAfter === 0 ||
      (gapAfter >= minNeededGap && gapAfter % minNeededGap === 0) ||
      (gapAfter >= serviceDuration &&
        (gapAfter - serviceDuration) % minNeededGap === 0);

    return isBeforeValid && isAfterValid;
  });

  return {
    isClosed: false,
    slots: cleanSlots,
  };
}
