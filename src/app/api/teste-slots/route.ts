import { getAvailableSlotsForDay } from "@/utils/slots";

import { NextResponse, NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const shopId = 52;

    const barberId = 44;

    const dateStr = searchParams.get("date") || "2026-09-18"; // Permite mudar a data na URL se quiser

    // Pega a duração enviada na URL ex: ?duration=50 ou usa 30 por padrão

    const serviceDuration = Number(searchParams.get("duration")) || 30;

    const result = await getAvailableSlotsForDay(
      shopId,

      dateStr,

      barberId,

      serviceDuration,
    );

    return NextResponse.json({
      shopId,

      barberId,

      dateTested: dateStr,

      serviceDurationTested: `${serviceDuration} min (+ 10m buffer)`,

      totalSlots: result.slots.length,

      slots: result.slots,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
