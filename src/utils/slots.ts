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

const BUFFER_MINUTES = 10; // Intervalo de limpeza/descanso
const MIN_SERVICE_DURATION = 30; // Menor tempo de serviço da barbearia

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
  dateStr: string,
  barberId: number,
  serviceDuration: number,
): Promise<SlotsResult> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: { closedDays: true },
  });

  if (!shop) throw new Error("Barbearia não encontrada.");

  // 1. CHECAGEM DE FERIADOS, DOMINGOS E FOLGAS
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

  // 2. BUSCA DE AGENDAMENTOS EXISTENTES
  // Assume que app.endTime no Banco já inclui serviceDuration + BUFFER_MINUTES
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

  // 3. CÁLCULO DA GRADE DINÂMICA
  const openMin = timeToMinutes(shop.openingTime);
  const closeMin = timeToMinutes(shop.closingTime);
  const totalNeededMinutes = serviceDuration + BUFFER_MINUTES;

  const lunchStartMin =
    shop.hasLunchBreak && shop.lunchStart
      ? timeToMinutes(shop.lunchStart)
      : null;

  const lunchEndMin =
    shop.hasLunchBreak && shop.lunchEnd ? timeToMinutes(shop.lunchEnd) : null;

  const rawSlots: Slot[] = [];
  const slotStep = 10; // Varredura a cada 10 min

  let min = openMin;

  while (min <= closeMin) {
    const slotStart = min;
    const slotEnd = slotStart + totalNeededMinutes;
    const timeString = minutesToTime(slotStart);

    // Valida encerramento do expediente
    if (slotEnd > closeMin + BUFFER_MINUTES) {
      min += slotStep;
      continue;
    }

    // Valida conflito com almoço
    if (lunchStartMin !== null && lunchEndMin !== null) {
      if (slotStart < lunchEndMin && slotEnd > lunchStartMin) {
        if (slotStart >= lunchStartMin && slotStart < lunchEndMin) {
          rawSlots.push({ time: timeString, status: "ALMOCO" });
        }
        min += slotStep;
        continue;
      }
    }

    // Valida colisão direta com outros agendamentos
    const hasCollision = busyRanges.some(
      (range) => slotStart < range.end && slotEnd > range.start,
    );

    if (hasCollision) {
      rawSlots.push({ time: timeString, status: "OCUPADO" });
      min += slotStep;
      continue;
    }

    // Pontos de Ancoragem (Início do dia, Volta do Almoço ou Colado ao término do cliente anterior)
    const isBeginningOfDay = slotStart === openMin;
    const isAfterLunch = lunchEndMin !== null && slotStart === lunchEndMin;
    const isBackToBackWithPrevious = busyRanges.some(
      (range) => range.end === slotStart,
    );
    const fitsPerfectlyBeforeNext = busyRanges.some(
      (range) => slotEnd === range.start,
    );

    const isRecommended =
      isBeginningOfDay ||
      isAfterLunch ||
      isBackToBackWithPrevious ||
      fitsPerfectlyBeforeNext;

    rawSlots.push({
      time: timeString,
      status: isRecommended ? "RECOMENDADO" : "DISPONIVEL",
      reason: isRecommended ? "Encaixe ideal sem lacunas" : undefined,
    });

    min += slotStep;
  }

  // 4. FILTRAGEM ANTI-LACUNAS (UX)
  const cleanSlots = rawSlots.filter((slot) => {
    if (slot.status === "OCUPADO" || slot.status === "ALMOCO") return false;

    // 1. Todo horário Ancorado/Recomendado deve aparecer (pois garante 0 minutos de buraco)
    if (slot.status === "RECOMENDADO") return true;

    const slotStartMins = timeToMinutes(slot.time);
    const isRounded30Min = slotStartMins % 30 === 0;

    if (!isRounded30Min) return false;

    // 2. Para horários redondos (:00 e :30) que não são ancorados,
    // verifica se o intervalo gerado antes dele é suficiente para caber ao menos o menor serviço
    const prevBoundary = busyRanges
      .filter((r) => r.end <= slotStartMins)
      .reduce((max, r) => Math.max(max, r.end), openMin);

    const gapBefore = slotStartMins - prevBoundary;

    // Se o espaço antes for 0 ou maior/igual ao menor serviço, o slot é válido
    return gapBefore === 0 || gapBefore >= MIN_SERVICE_DURATION;
  });

  return {
    isClosed: false,
    slots: cleanSlots,
  };
}
