// src/utils/slots.ts
import prisma from "@/lib/db";

interface Slot {
  time: string;
  status: "DISPONIVEL" | "OCUPADO" | "ALMOCO" | "RECOMENDADO";
  reason?: string;
}

// Funções auxiliares para converter Horas em Minutos absolutos do dia
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
  dateStr: string, // Formato YYYY-MM-DD
  barberId: number,
  serviceDuration: number,
): Promise<Slot[]> {
  // 1. Buscar dados de funcionamento da barbearia
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
  });

  if (!shop) throw new Error("Barbearia não encontrada.");

  // 2. Definir os limites do dia no fuso horário correto (-03:00)
  const startOfDay = new Date(`${dateStr}T00:00:00-03:00`);
  const endOfDay = new Date(`${dateStr}T23:59:59-03:00`);

  // 3. Buscar todos os agendamentos confirmados do barbeiro naquele dia
  const appointments = await prisma.appointment.findMany({
    where: {
      shopId,
      barberId,
      status: "CONFIRMED",
      startTime: { gte: startOfDay, lte: endOfDay },
    },
    orderBy: { startTime: "asc" },
  });

  // Converter agendamentos ocupados em minutos absolutos do dia
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
    return {
      start: timeToMinutes(startLocal),
      end: timeToMinutes(endLocal),
    };
  });

  // 4. Parsear horários da barbearia para minutos
  const openMin = timeToMinutes(shop.openingTime);
  const closeMin = timeToMinutes(shop.closingTime);

  const lunchStartMin =
    shop.hasLunchBreak && shop.lunchStart
      ? timeToMinutes(shop.lunchStart)
      : null;
  const lunchEndMin =
    shop.hasLunchBreak && shop.lunchEnd ? timeToMinutes(shop.lunchEnd) : null;

  const slots: Slot[] = [];
  const step = 15; // Varre a agenda a cada 15 minutos para achar opções de encaixe

  // 5. Loop para gerar e avaliar cada slot possível do dia
  for (let min = openMin; min <= closeMin - serviceDuration; min += step) {
    const slotStart = min;
    const slotEnd = min + serviceDuration;
    const timeString = minutesToTime(slotStart);

    // Regra A: Valida se cai dentro do intervalo de almoço
    if (lunchStartMin !== null && lunchEndMin !== null) {
      // Se o agendamento começar ou terminar dentro do almoço, ou englobar o almoço
      if (
        (slotStart >= lunchStartMin && slotStart < lunchEndMin) ||
        (slotEnd > lunchStartMin && slotEnd <= lunchEndMin)
      ) {
        slots.push({ time: timeString, status: "ALMOCO" });
        continue;
      }
    }

    // Regra B: Valida se bate de frente com algum agendamento já existente
    const hasOverlap = busyRanges.some((range) => {
      return slotStart < range.end && slotEnd > range.start;
    });

    if (hasOverlap) {
      slots.push({ time: timeString, status: "OCUPADO" });
      continue;
    }

    // Regra C: Otimização de Gaps (Aqui está o segredo!)
    // Se o slot estiver colado no início do expediente, ou colado exatamente no FIM de outro agendamento,
    // significa que ele é RECOMENDADO para evitar buracos na agenda.
    const isBackToBackWithPrevious = busyRanges.some(
      (range) => range.end === slotStart,
    );
    const isBackToBackWithNext = busyRanges.some(
      (range) => range.start === slotEnd + 10,
    ); // +10min de intervalo padrão que você usa
    const isBeginningOfDay = slotStart === openMin;

    if (isBeginningOfDay || isBackToBackWithPrevious || isBackToBackWithNext) {
      slots.push({
        time: timeString,
        status: "RECOMENDADO",
        reason: "Otimiza a sequência de atendimentos da barbearia",
      });
    } else {
      slots.push({ time: timeString, status: "DISPONIVEL" });
    }
  }

  return slots;
}
