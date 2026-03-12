"use server";

import prisma from "@/lib/db";
import { FormLoginProps } from "@/types/types";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

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

    const cookieStore = await cookies();
    cookieStore.set("auth_token", String(user.id), {
      httpOnly: true,
      maxAge: 60 * 60 * 24,
    });

    return {
      success: true,
      user: { id: user.id, role: user.role },
    };
  } catch (error) {
    console.error("Erro no login:", error);
    return { sucess: false, error: "Erro ao realizar login" };
  }
}
