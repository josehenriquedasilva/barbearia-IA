import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const seisMesesAtras = new Date();
    seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 6);

    const vinteQuatroHorasAtras = new Date(Date.now() - 1 * 60 * 1000);

    const deleted = await prisma.service.deleteMany({
      where: {
        active: false,
        disableAt: {
          lte: seisMesesAtras,
        },
      },
    });

    const deletedMessages = await prisma.chatMessage.deleteMany({
      where: {
        createdAt: { lt: vinteQuatroHorasAtras },
      },
    });

    return NextResponse.json({
      success: true,
      servicesRemoved: deleted.count,
      messagesRemoved: deletedMessages.count,
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
