import prisma from "@/lib/db";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { jwtVerify } from "jose";

function getJwtSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET || "chave_secreta_fallback_dev";
  return new TextEncoder().encode(secret);
}

export type SessionUser = {
  id: number;
  role: string;
  shopId: number;
};


export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;

    if (!token) return null;

    const { payload } = await jwtVerify(token, getJwtSecretKey());

    const userId = Number(payload.id || payload.sub);

    if (!userId || isNaN(userId)) return null;

    const user = await prisma.barber.findUnique({
      where: { id: userId },
      select: { id: true, role: true, shopId: true },
    });

    if (!user) return null;

    return {
      id: user.id,
      role: user.role,
      shopId: user.shopId,
    };
  } catch {
    return null;
  }
});

export async function verifyCronSecret(): Promise<boolean> {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
