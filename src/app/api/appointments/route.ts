import prisma from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    const whereClause = id ? { barberId: Number(id) } : {};

    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      orderBy: { startTime: "asc" },
      select: {
        id: true,
        clientName: true,
        clientPhone: true,
        barberId: true,
        barber: {
          select: {
            id: true,
            name: true,
          },
        },
        serviceId: true,
        service: {
          select: {
            name: true,
            durationMinutes: true,
            price: true,
          },
        },
        startTime: true,
        endTime: true,
        status: true,
      },
    });
    return NextResponse.json(appointments, { status: 200 });
  } catch (error) {
    console.error("Erro ao buscar agendamentos:", error);
    return new Response("Erro ao buscar agendamentos", { status: 500 });
  }
}
