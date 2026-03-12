"use server";

import { Prisma } from "@/generated/prisma/client";
import { PlanType, Role } from "@/generated/prisma/enums";
import prisma from "@/lib/db";
import { FormBarberProps } from "@/types/types";
import bcrypt from "bcryptjs";

export async function registerShop(formData: FormBarberProps) {
  const { barberName, phone, adminName, email, password, services, plan } =
    formData;

  try {
    const rawPhone = phone.replace(/\D/g, "");

    const slug = barberName
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const hashedPassword = await bcrypt.hash(password, 10);

    const selectedPlan =
      plan?.toUpperCase() === "SILVER" ? PlanType.SILVER : PlanType.BRONZE;

    const result = await prisma.$transaction(async (tx) => {
      const shop = await tx.shop.create({
        data: {
          name: barberName,
          phone: rawPhone,
          slug: slug,
          plan: selectedPlan,
        },
      });

      const admin = await tx.barber.create({
        data: {
          name: adminName,
          email: email,
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

      return { shop, admin };
    });

    return { success: true, user: result.admin };
  } catch (error) {
    console.error("Erro no cadastro:", error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        const target = error.meta?.target as string[];
        if (target.includes("email"))
          return { success: false, error: "Email já está em uso." };
        if (target.includes("slug"))
          return {
            success: false,
            error: "Este nome de barbearia já está sendo usado.",
          };
      }
    }

    return { success: false, error: "Erro ao criar conta. Tente novamente." };
  }
}
