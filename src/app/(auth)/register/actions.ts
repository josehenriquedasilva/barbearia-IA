"use server";

import prisma from "@/lib/db";
import { FormBarberProps } from "@/types/types";
import { Prisma, PlanType, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const EVO_URL = process.env.NEXT_PUBLIC_EVOLUTION_URL;
const EVO_KEY = process.env.EVOLUTION_API_KEY;

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
          whatsappInstance: slug,
        },
      });

      const finalInstanceName = `${slug}-${shop.id}`;

      const updatedShop = await tx.shop.update({
        where: { id: shop.id },
        data: { whatsappInstance: finalInstanceName },
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

      return { shop: updatedShop, admin };
    });

    const instanceToCreate = result.shop.whatsappInstance;

    try {
      const response = await fetch(`${EVO_URL}/instance/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: EVO_KEY as string,
        },
        body: JSON.stringify({
          instanceName: instanceToCreate,
          token: "",
          number: rawPhone,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
        }),
      });

      const data = await response.json();

      if (response.ok) {
        await prisma.shop.update({
          where: { id: result.shop.id },
          data: { whatsappToken: data.hash || data.token?.value || null },
        });
        console.log("Instância criada com sucesso e Token salvo!");
      } else {
        console.error(
          "A Evolution recusou o pedido:",
          data.message || data.error,
        );
      }

      if (process.env.NEXT_PUBLIC_SITE_URL) {
        await fetch(`${EVO_URL}/webhook/set/${instanceToCreate}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: EVO_KEY as string,
          },
          body: JSON.stringify({
            url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/whatsapp`,
            enabled: true,
            events: ["MESSAGES_UPSERT"],
          }),
        });
      }
    } catch (evoError) {
      console.error("ERRO FATAL NA COMUNICAÇÃO:", evoError);
    }

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
