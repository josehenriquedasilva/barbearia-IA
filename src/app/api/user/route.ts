import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { message: "ID não fornecido" },
        { status: 400 },
      );
    }

    const barber = await prisma.barber.findUnique({
      where: { id: Number(id) },
      select: {
        id: true,
        name: true,
      },
    });

    if (!barber) {
      return NextResponse.json(
        { message: "Barbeiro não encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json(barber);
  } catch (error) {
    console.error("Erro ao buscar usuário:", error);
    return NextResponse.json(
      { message: "Erro ao buscar dados do usuário." },
      { status: 500 },
    );
  }
}
