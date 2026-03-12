import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const seisMesesAtras = new Date();
    seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 6);

    const deleted = await prisma.service.deleteMany({
      where: {
        active: false,
        disableAt: {
          lte: seisMesesAtras,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `${deleted.count} serviços antigos foram removidos permanentemente.`,
    });
  } catch (error) {
    console.error("Erro na limpeza:", error);
    return NextResponse.json(
      { success: false, error: "Erro interno no servidor" },
      { status: 500 },
    );
  }
}
