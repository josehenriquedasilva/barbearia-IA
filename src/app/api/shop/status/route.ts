import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");

    if (!shopId) {
      return NextResponse.json(
        { error: "Shop ID não fornecido" },
        { status: 400 },
      );
    }

    const shop = await prisma.shop.findUnique({
      where: { id: Number(shopId) },
      include: { services: true },
    });

    if (!shop) {
      return NextResponse.json(
        { error: "Barbearia não encontrada" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, shop }, { status: 200 });
  } catch (error) {
    console.error("Erro ao buscar status da barbearia:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor" },
      { status: 500 },
    );
  }
}
