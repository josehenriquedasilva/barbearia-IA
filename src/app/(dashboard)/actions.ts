"use server";

import prisma from "@/lib/db";
import { sendWhatsAppMessage } from "@/lib/whatsApp";
import { SettingsPayload } from "@/types/types";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Buscar barbearia no banco de dados
export async function getBarbersAction(shopId: number) {
  return await prisma.barber.findMany({
    where: { shopId },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
}

// Criar/registrar barbearia
export async function createBarberAction(
  shopId: number,
  data: {
    name: string;
    email: string;
    password: string;
  },
) {
  if (data.name.length < 4) {
    return { success: false, error: "Nome de usuário muito curto." };
  } else if (!data.email.includes("@")) {
    return { success: false, error: "Email inválido." };
  } else if (data.password.length < 6) {
    return {
      success: false,
      error: "A senha deve ter no mínimo 6 caracteres.",
    };
  }

  try {
    const hashedPassword = await bcrypt.hash(data.password, 10);

    await prisma.barber.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: "BARBER",
        shopId: shopId,
      },
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Erro ao criar barbeiro:", error);
    return { success: false, error: "Erro ao cadastrar barbeiro." };
  }
}

// Cancelar agendamentos
export async function cancelAppointmentAction(
  appointmentId: number,
  reason: string,
) {
  try {
    const app = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { service: true, barber: true },
    });

    if (!app) {
      return { success: false, error: "Agendamento não encontrado." };
    }

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: "CANCELED", cancelReason: reason },
    });

    const message = `Olá *${app.clientName}*, infelizmente seu agendamento para o dia ${app.startTime.toLocaleDateString("pt-BR")} às ${app.startTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} foi *cancelado* pela barbearia.\n\n*Motivo:* ${reason}`;

    await sendWhatsAppMessage(app.clientPhone, message);

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Erro ao cancelar agendamento:", error);
    return { success: false, error: "Não foi possível cancelar." };
  }
}

// Atualizar dias fechados
export async function updateClosedDays(
  shopId: number,
  days: { date: string; reason?: string }[],
) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.closedDay.deleteMany({ where: { shopId } });
      await tx.closedDay.createMany({
        data: days.map((d) => ({
          shopId,
          date: d.date,
          reason: d.reason || "Não informado",
        })),
      });

      for (const day of days) {
        const startOfDay = new Date(`${day.date}T00:00:00Z`);
        const endOfDay = new Date(`${day.date}T23:59:59Z`);

        const affectedApps = await tx.appointment.findMany({
          where: {
            shopId,
            startTime: { gte: startOfDay, lte: endOfDay },
            status: "CONFIRMED",
          },
        });

        for (const app of affectedApps) {
          await tx.appointment.update({
            where: { id: app.id },
            data: {
              status: "CANCELED",
              cancelReason: `Dia fechado: ${day.reason}`,
            },
          });

          const msg = `Olá *${app.clientName}*, estamos entrando em contato para informar que a barbearia estará fechada no dia ${day.date} (*Motivo: ${day.reason}*). Por isso, seu agendamento foi cancelado. Por favor, escolha uma nova data no nosso chat!`;

          await sendWhatsAppMessage(app.clientPhone, msg);
        }
      }
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Erro ao atualizar dias fechados:", error);
    return {
      success: false,
      error: "Não foi possível salvar os dias fechados.",
    };
  }
}

// Atualizar serviços
export async function updateServicesAction(
  shopId: number,
  payload: SettingsPayload,
) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.shop.update({
        where: { id: shopId },
        data: {
          openingTime: payload.openingTime,
          closingTime: payload.closingTime,
          hasDayOff: payload.hasDayOff,
          dayOff: payload.dayOff,
          isClosedSunday: payload.isClosedSunday,
          openingSunday: payload.openingSunday,
          closingSunday: payload.closingSunday,
          hasLunchBreak: payload.hasLunchBreak,
          lunchStart: payload.lunchStart,
          lunchEnd: payload.lunchEnd,
        },
      });

      const currentServices = await tx.service.findMany({
        where: { shopId, active: true },
      });

      const incomingIds = payload.services.map((s) => s.id);

      const toDeactivate = currentServices.filter(
        (s) => !incomingIds.includes(s.id),
      );

      for (const service of toDeactivate) {
        await tx.service.update({
          where: { id: service.id },
          data: { active: false, disableAt: new Date() },
        });

        const appointmentsToNotify = await tx.appointment.findMany({
          where: {
            serviceId: service.id,
            startTime: { gte: new Date() },
            status: "CONFIRMED",
          },
        });

        for (const app of appointmentsToNotify) {
          await tx.appointment.update({
            where: { id: app.id },
            data: {
              status: "CANCELED",
              cancelReason: `Serviço "${service.name}" descontinuado.`,
            },
          });

          const msg = `Olá *${app.clientName}*, informamos que o serviço *${service.name}* não está mais disponível em nossa unidade. Por este motivo, seu agendamento para o dia ${app.startTime.toLocaleDateString("pt-BR")} foi cancelado. Por favor, verifique nossos outros serviços disponíveis no chat!`;

          await sendWhatsAppMessage(app.clientPhone, msg);
        }
      }

      for (const s of payload.services) {
        const isNew = s.id > 1700000000000;

        if (isNew) {
          await tx.service.create({
            data: {
              name: s.name,
              price: s.price,
              durationMinutes: s.duration,
              shopId: shopId,
              active: true,
            },
          });
        } else {
          await tx.service.update({
            where: { id: s.id },
            data: {
              name: s.name,
              price: s.price,
              durationMinutes: s.duration,
              active: true,
              disableAt: null,
            },
          });
        }
      }
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
}

// Fazer logout/sair
export async function logout() {
  const cookieStore = await cookies();
  (await cookieStore).delete("auth_token");
  redirect("/login");
}

// Gerar código de conexão com IA
export async function getPairingCodeAction(
  instanceName: string,
  phoneNumber: string,
) {
  const EVO_URL = process.env.NEXT_PUBLIC_EVOLUTION_URL;
  const EVO_KEY = process.env.EVOLUTION_API_KEY;

  let cleanNumber = phoneNumber.replace(/\D/g, "");
  if (!cleanNumber.startsWith("55")) {
    cleanNumber = `55${cleanNumber}`;
  }

  try {
    await fetch(`${EVO_URL}/instance/create`, {
      method: "POST",
      headers: {
        apikey: EVO_KEY as string,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instanceName,
        qrcode: false,
        integration: "WHATSAPP-BAILEYS",
      }),
    });

    await new Promise((res) => setTimeout(res, 3000));

    const url = `${EVO_URL}/instance/connect/${instanceName}?number=${cleanNumber}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        apikey: EVO_KEY as string,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    const data = await response.json();

    if (data.pairingCode) {
      return { success: true, pairingCode: data.pairingCode };
    }
    
    console.error("Resposta inesperada da API:", data);
    return { success: false, error: "Falha ao gerar pairingCode." };
  } catch (error) {
    console.error("Erro na Action:", error);
    return { success: false, error: "Erro interno no servidor." };
  }
}

// Verificar status da conexão com IA
export async function checkWhatsAppStatusAction(instanceName: string) {
  const EVO_URL = process.env.NEXT_PUBLIC_EVOLUTION_URL;
  const EVO_KEY = process.env.EVOLUTION_API_KEY;

  try {
    const response = await fetch(
      `${EVO_URL}/instance/connectionState/${instanceName}`,
      {
        method: "GET",
        headers: { apikey: EVO_KEY as string },
        cache: "no-store",
      },
    );

    const data = await response.json();

    return {
      success: true,
      connected: data.instance?.state === "open",
    };
  } catch (error) {
    console.error("Erro Evolution Connection:", error);
    return { success: false, connected: false };
  }
}
