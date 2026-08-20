"use server";

import prisma from "@/lib/db";
import { FormLoginProps } from "@/types/types";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { SignJWT } from "jose";

function getJwtSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET || "chave_secreta_fallback_dev";
  return new TextEncoder().encode(secret);
}

export async function loginAction(formData: FormLoginProps) {
  const { email, password } = formData;

  try {
    const user = await prisma.barber.findUnique({
      where: { email },
    });

    if (!user) {
      return { success: false, error: "E-mail inválido." };
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return { success: false, error: "Senha incorreta." };
    }

    // Declaração do ID dentro da payload principal do token
    const token = await new SignJWT({
      id: user.id,
      role: user.role,
      shopId: user.shopId,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(user.id))
      .setIssuedAt()
      .setExpirationTime("1d")
      .sign(getJwtSecretKey());

    const cookieStore = await cookies();
    cookieStore.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });

    return {
      success: true,
      user: { id: user.id, role: user.role, shopId: user.shopId },
    };
  } catch (error) {
    console.error("Erro no login:", error);
    return {
      success: false,
      error: "Erro ao realizar login. Tente novamente.",
    };
  }
}
