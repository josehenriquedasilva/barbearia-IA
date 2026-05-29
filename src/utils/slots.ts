import prisma from "@/lib/db";

interface Slot {
  time: string;
  status: "DISPONIVEL" | "OCUPADO" | "ALMOCO" | "RECOMENDADO";
  reason?: string;
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
  dateStr: string,
  barberId: number,
  serviceDuration: number,
): Promise<Slot[]> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
  });

  if (!shop) throw new Error("Barbearia não encontrada.");

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
    const startLocal = app.startTime.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    const endLocal = app.endTime.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    return { start: timeToMinutes(startLocal), end: timeToMinutes(endLocal) };
  });

  const openMin = timeToMinutes(shop.openingTime);
  const closeMin = timeToMinutes(shop.closingTime);
  const maxCloseMin = closeMin + 20; // Tolerância de 20 min no fechamento

  const lunchStartMin =
    shop.hasLunchBreak && shop.lunchStart
      ? timeToMinutes(shop.lunchStart)
      : null;
  const lunchEndMin =
    shop.hasLunchBreak && shop.lunchEnd ? timeToMinutes(shop.lunchEnd) : null;
  const maxLunchStartMin = lunchStartMin !== null ? lunchStartMin + 10 : null; // Tolerância de 10 min no almoço

  const slots: Slot[] = [];
  const interval = 10;

  let min = openMin;

  // O loop agora roda permitindo que a duração caiba dentro do limite estendido de fechamento
  while (min <= maxCloseMin - serviceDuration) {
    const slotStart = min;
    const slotEnd = min + serviceDuration;
    const timeString = minutesToTime(slotStart);

    // 1. VERIFICAÇÃO DE ALMOÇO (COM TOLERÂNCIA)
    if (
      lunchStartMin !== null &&
      lunchEndMin !== null &&
      maxLunchStartMin !== null
    ) {
      const invadesLunchPastTolerance =
        slotEnd > maxLunchStartMin && slotStart < lunchEndMin;
      const startsDuringLunch =
        slotStart >= lunchStartMin && slotStart < lunchEndMin;

      if (invadesLunchPastTolerance || startsDuringLunch) {
        slots.push({ time: timeString, status: "ALMOCO" });
        min = lunchEndMin + interval; // Pula direto para o primeiro horário pós-almoço
        continue;
      }
    }

    // 2. VERIFICAÇÃO DE HORÁRIO OCUPADO
    const conflictingApp = busyRanges.find(
      (range) => slotStart < range.end && slotEnd > range.start,
    );

    if (conflictingApp) {
      slots.push({ time: timeString, status: "OCUPADO" });
      min = conflictingApp.end;
      continue;
    }

    // 3. HORÁRIO DISPONÍVEL
    const isBeginningOfDay = slotStart === openMin;
    const isBackToBackWithPrevious = busyRanges.some(
      (range) => range.end === slotStart,
    );
    const isBackToBackWithNext = busyRanges.some(
      (range) => range.start === slotEnd + interval,
    );

    if (isBeginningOfDay || isBackToBackWithPrevious || isBackToBackWithNext) {
      slots.push({
        time: timeString,
        status: "RECOMENDADO",
        reason: "Otimiza a sequência de atendimentos da barbearia",
      });
    } else {
      slots.push({ time: timeString, status: "DISPONIVEL" });
    }

    min += serviceDuration + interval;
  }

  return slots;
}
