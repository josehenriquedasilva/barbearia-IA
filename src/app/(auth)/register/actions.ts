"use server";

import prisma from "@/lib/db";
import { FormBarberProps } from "@/types/types";
import { Prisma, PlanType, Role, SubscriptionStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { SignJWT } from "jose";

function getJwtSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET || "chave_secreta_fallback_dev";
  return new TextEncoder().encode(secret);
}

async function generateUniqueSlug(
  tx: Prisma.TransactionClient,
  baseName: string,
): Promise<string> {
  const slug = baseName
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const existingShops = await tx.shop.findMany({
    where: {
      slug: {
        startsWith: slug,
      },
    },
    select: { slug: true },
  });

  if (existingShops.length === 0) {
    return slug;
  }

  const slugsSet = new Set(existingShops.map((s: { slug: string }) => s.slug));

  let finalSlug = slug;
  let counter = 1;

  while (slugsSet.has(finalSlug)) {
    finalSlug = `${slug}-${counter}`;
    counter++;
  }

  return finalSlug;
}

export async function registerShop(
  formData: FormBarberProps & { acceptedTerms?: boolean },
) {
  const {
    barberName,
    phone,
    adminName,
    email,
    password,
    services,
    plan,
    openingTime,
    closingTime,
    isClosedSunday,
    openingSunday,
    closingSunday,
    hasDayOff,
    dayOff,
    hasLunchBreak,
    lunchStart,
    lunchEnd,
    acceptedTerms,
  } = formData;

  if (!acceptedTerms) {
    return {
      success: false,
      error:
        "Você precisa aceitar os Termos de Uso e a Política de Privacidade para se cadastrar.",
    };
  }

  try {
    const rawPhone = phone.replace(/\D/g, "");
    const hashedPassword = await bcrypt.hash(password, 10);
    const selectedPlan =
      plan?.toUpperCase() === "SILVER" ? PlanType.SILVER : PlanType.BRONZE;

    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 7);

    const result = await prisma.$transaction(async (tx) => {
      const uniqueSlug = await generateUniqueSlug(tx, barberName);

      const shop = await tx.shop.create({
        data: {
          name: barberName,
          phone: rawPhone,
          slug: uniqueSlug,
          plan: selectedPlan,
          subscriptionStatus: SubscriptionStatus.TRIAL,
          subscriptionEnd: trialEndDate,
          openingTime,
          closingTime,
          isClosedSunday,
          openingSunday: isClosedSunday ? null : openingSunday,
          closingSunday: isClosedSunday ? null : closingSunday,
          hasDayOff,
          dayOff: hasDayOff ? dayOff : null,
          hasLunchBreak,
          lunchStart: hasLunchBreak ? lunchStart : null,
          lunchEnd: hasLunchBreak ? lunchEnd : null,
        },
      });

      const admin = await tx.barber.create({
        data: {
          name: adminName,
          email: email.trim().toLowerCase(),
          password: hashedPassword,
          role: Role.ADMIN,
          shopId: shop.id,
        },
      });

      if (services && services.length > 0) {
        await tx.service.createMany({
          data: services.map((s) => ({
            name: s.name,
            price: s.price,
            durationMinutes: s.duration,
            shopId: shop.id,
          })),
        });
      }

      return { admin };
    });

    // AUTO-LOGIN: Gerar o token JWT e definir o cookie de sessão automaticamente
    const token = await new SignJWT({
      id: result.admin.id,
      role: result.admin.role,
      shopId: result.admin.shopId,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(result.admin.id))
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

    return { success: true, user: result.admin };
  } catch (error) {
    console.error("Erro no cadastro:", error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        const target = JSON.stringify(error.meta?.target || "");
        if (target.includes("email")) {
          return { success: false, error: "Email já está em uso." };
        }
      }
    }

    return { success: false, error: "Erro ao criar conta. Tente novamente." };
  }
}
