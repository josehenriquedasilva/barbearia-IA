import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const tresMesesAtras = new Date();
    tresMesesAtras.setMonth(tresMesesAtras.getMonth() - 3);

    const vinteQuatroHorasAtras = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const duasSemanasAtras = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const dataLimiteStr = duasSemanasAtras.toISOString().split("T")[0];

    const deletedServices = await prisma.service.deleteMany({
      where: {
        active: false,
        disableAt: {
          lte: tresMesesAtras,
        },
      },
    });

    const deletedMessages = await prisma.chatMessage.deleteMany({
      where: {
        createdAt: { lt: vinteQuatroHorasAtras },
      },
    });

    const deletedClosedDays = await prisma.closedDay.deleteMany({
      where: {
        date: { lt: dataLimiteStr },
      },
    });

    return NextResponse.json({
      success: true,
      servicesRemoved: deletedServices.count,
      messagesRemoved: deletedMessages.count,
      closedDaysRemoved: deletedClosedDays.count,
      message: "Limpeza concluída com sucesso.",
    });
  } catch (error) {
    console.error("Erro na limpeza:", error);
    return NextResponse.json(
      { success: false, error: "Erro interno no servidor" },
      { status: 500 },
    );
  }
}
