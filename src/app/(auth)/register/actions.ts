"use server";

import prisma from "@/lib/db";
import { FormBarberProps } from "@/types/types";
import { Prisma, PlanType, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

async function generateUniqueSlug(
  tx: Prisma.TransactionClient,
  baseName: string,
): Promise<string> {
  // 1. Gera o slug base limpo
  const slug = baseName
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // 2. Tenta encontrar slugs que começam com o mesmo padrão
  const existingShops = await tx.shop.findMany({
    where: {
      slug: {
        startsWith: slug,
      },
    },
    select: { slug: true },
  });

  // 3. Se não existe nenhum, usa o base
  if (existingShops.length === 0) {
    return slug;
  }

  // 4. Se já existem, vamos incrementar
  // Criamos um Set com os slugs existentes para verificação rápida
  const slugsSet = new Set(existingShops.map((s: { slug: string }) => s.slug));

  let finalSlug = slug;
  let counter = 1;

  // Enquanto o slug gerado existir no Set, incrementamos o contador
  while (slugsSet.has(finalSlug)) {
    finalSlug = `${slug}-${counter}`;
    counter++;
  }

  return finalSlug;
}

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
      const uniqueSlug = await generateUniqueSlug(tx, barberName);

      const shop = await tx.shop.create({
        data: {
          name: barberName,
          phone: rawPhone,
          slug: uniqueSlug,
          plan: selectedPlan,
          whatsappInstance: uniqueSlug,
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

      return { admin };
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
