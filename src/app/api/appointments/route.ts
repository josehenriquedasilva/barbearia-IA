import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("barberId");
    const dateParam = searchParams.get("date");

    const whereClause: Prisma.AppointmentWhereInput = {};

    if (id) {
      whereClause.barberId = Number(id);
    }

    if (dateParam) {
      const [year, month, day] = dateParam.split("-").map(Number);
      const startOfDay = new Date(year, month - 1, day, 0, 0, 0);
      const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

      whereClause.startTime = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

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
