"use server";

import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import {
  sendWhatsAppMessage,
  setWebhookForInstance,
  setInstanceSettings,
} from "@/lib/whatsApp";
import { SettingsPayload } from "@/types/types";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// -----------------------------------------------------------------------------
// TIPOS E HELPER DE INTEGRAÇÃO
// -----------------------------------------------------------------------------

interface PilotStatusItem {
  id?: string | number;
  whatsappNumberId?: string | number;
  numberId?: string | number;
  phone?: string | number;
  number?: string | number | { number?: string | number };
  instance?: {
    id?: string | number;
  };
}

// Helper padronizado para URL do Pilot Status
function getPilotStatusBaseUrl(): string {
  const rawBaseUrl =
    process.env.PILOT_STATUS_NATIVE_URL || "https://pilotstatus.com.br";
  const baseUrl = rawBaseUrl.replace(/\/$/, "");
  return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
}

// Helper para buscar chave da API do WhatsApp
function getWhatsAppApiKey(): string | undefined {
  return (
    process.env.EVOLUTION_TENANT_KEY ||
    process.env.PILOT_STATUS_API_KEY ||
    process.env.WHATSAPP_API_KEY
  );
}

// Helper para buscar o ID do número cadastrado na conta do Pilot Status
async function findPilotStatusNumber(
  baseUrl: string,
  apiKey: string,
  cleanNumber: string,
) {
  try {
    const listRes = await fetch(`${baseUrl}/numbers`, {
      headers: { "x-api-key": apiKey },
      cache: "no-store",
    });

    if (listRes.ok) {
      const numbersList = await listRes.json();
      const items: PilotStatusItem[] = Array.isArray(numbersList)
        ? numbersList
        : numbersList.data || numbersList.numbers || [];

      const found = items.find((item) => {
        const rawPhone =
          typeof item.number === "object"
            ? item.number?.number
            : item.number || item.phone || "";

        const itemPhone = String(rawPhone || "").replace(/\D/g, "");
        return (
          itemPhone.length > 0 &&
          (itemPhone.includes(cleanNumber) || cleanNumber.includes(itemPhone))
        );
      });

      if (found) {
        return {
          numberId: found.id || found.whatsappNumberId || found.numberId,
          instanceId: found.instance?.id || found.id,
        };
      }
    }
  } catch (e) {
    console.error("Erro ao buscar números no Pilot Status:", e);
  }
  return null;
}

// -----------------------------------------------------------------------------
// ACTIONS DE GERENCIAMENTO DA EQUIPE E CONTA
// -----------------------------------------------------------------------------

export async function getBarbersAction() {
  const user = await getSessionUser();
  if (!user) return [];

  return await prisma.barber.findMany({
    where: { shopId: user.shopId },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
}

export async function createBarberAction(data: {
  name: string;
  email: string;
  password: string;
}) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return { success: false, error: "Acesso não autorizado." };
  }

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
        shopId: user.shopId,
      },
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Erro ao criar barbeiro:", error);
    return { success: false, error: "Erro ao cadastrar barbeiro." };
  }
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete("auth_token");
  redirect("/login");
}

// -----------------------------------------------------------------------------
// ACTIONS DE AGENDAMENTOS E CALENDÁRIO
// -----------------------------------------------------------------------------

export async function updateAppointmentsStatusAction() {
  const user = await getSessionUser();
  if (!user) return { success: false, error: "Não autenticado." };

  try {
    const now = new Date();

    await prisma.appointment.updateMany({
      where: {
        shopId: user.shopId,
        status: "CONFIRMED",
        endTime: { lt: now },
      },
      data: { status: "COMPLETED" },
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Erro ao atualizar status:", error);
    return { success: false, error: "Erro ao atualizar agendamentos." };
  }
}

export async function cancelAppointmentAction(
  appointmentId: number,
  reason: string,
) {
  const user = await getSessionUser();
  if (!user) return { success: false, error: "Não autenticado." };

  try {
    const app = await prisma.appointment.findFirst({
      where: { id: appointmentId, shopId: user.shopId },
      include: { service: true, barber: true, shop: true },
    });

    if (!app) {
      return { success: false, error: "Agendamento não encontrado." };
    }

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: "CANCELED", cancelReason: reason },
    });

    const message = `Olá *${app.clientName}*, infelizmente seu agendamento para o dia ${app.startTime.toLocaleDateString("pt-BR")} às ${app.startTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} foi *cancelado* pela barbearia.\n\n*Motivo:* ${reason}.\nVeja outro horário disponível enviando uma mensagem por aqui.`;

    const instanceName = app.shop.whatsappInstance || app.shop.slug;
    await sendWhatsAppMessage(instanceName, app.clientPhone, message);

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Erro ao cancelar agendamento:", error);
    return { success: false, error: "Não foi possível cancelar." };
  }
}

export async function updateClosedDays(
  days: { date: string; reason?: string }[],
) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return { success: false, error: "Acesso não autorizado." };
  }

  const shopId = user.shopId;

  try {
    const notificationsToSend: Array<{
      clientName: string;
      clientPhone: string;
      date: string;
      reason?: string;
    }> = [];

    let instanceName = "";

    await prisma.$transaction(async (tx) => {
      const shop = await tx.shop.findUnique({
        where: { id: shopId },
        select: { slug: true, whatsappInstance: true },
      });
      instanceName = shop?.whatsappInstance || shop?.slug || "";

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
              cancelReason: `Dia fechado: ${day.reason || "Não informado"}`,
            },
          });

          notificationsToSend.push({
            clientName: app.clientName,
            clientPhone: app.clientPhone,
            date: day.date,
            reason: day.reason,
          });
        }
      }
    });

    // Disparo das mensagens fora da transação
    for (const notify of notificationsToSend) {
      const msg = `Olá *${notify.clientName}*, estamos entrando em contato para informar que a barbearia estará fechada no dia ${notify.date} (*Motivo: ${notify.reason || "Não informado"}*). Por isso, seu agendamento foi cancelado. Por favor, escolha uma nova data enviando uma mensagem por aqui.`;
      try {
        await sendWhatsAppMessage(instanceName, notify.clientPhone, msg);
      } catch (err) {
        console.error("Erro ao enviar WhatsApp nos dias fechados:", err);
      }
    }

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

// -----------------------------------------------------------------------------
// ACTIONS DE CONFIGURAÇÃO DA LOJA E SERVIÇOS
// -----------------------------------------------------------------------------

export async function updateServicesAction(payload: SettingsPayload) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return { success: false, error: "Acesso não autorizado." };
  }

  const shopId = user.shopId;

  try {
    // Acumula notificações para disparar fora do banco
    const notificationsToSend: Array<{
      clientName: string;
      clientPhone: string;
      serviceName: string;
      startTime: Date;
    }> = [];

    let instanceName = "";

    await prisma.$transaction(async (tx) => {
      const shop = await tx.shop.findUnique({
        where: { id: shopId },
        select: { slug: true, whatsappInstance: true },
      });
      instanceName = shop?.whatsappInstance || shop?.slug || "";

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

          notificationsToSend.push({
            clientName: app.clientName,
            clientPhone: app.clientPhone,
            serviceName: service.name,
            startTime: app.startTime,
          });
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

    // Envio do WhatsApp executado APÓS o commit da transação
    for (const notify of notificationsToSend) {
      const msg = `Olá *${notify.clientName}*, informamos que o serviço *${notify.serviceName}* não está mais disponível em nossa unidade. Por este motivo, seu agendamento para o dia ${notify.startTime.toLocaleDateString("pt-BR")} foi cancelado. Por favor, verifique nossos outros serviços disponíveis enviando uma mensagem por aqui.`;
      try {
        await sendWhatsAppMessage(instanceName, notify.clientPhone, msg);
      } catch (err) {
        console.error("Erro ao enviar notificação WhatsApp:", err);
      }
    }

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Erro ao atualizar serviços:", error);
    return { success: false, error: "Erro ao salvar configurações." };
  }
}

export async function updateShopPhoneAction(newPhone: string) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return { success: false, error: "Acesso não autorizado." };
  }

  try {
    let cleanNumber = newPhone.replace(/\D/g, "");

    if (
      cleanNumber.startsWith("55") &&
      (cleanNumber.length === 12 || cleanNumber.length === 13)
    ) {
      cleanNumber = cleanNumber.substring(2);
    }

    if (cleanNumber.length < 10 || cleanNumber.length > 11) {
      return {
        success: false,
        error:
          "Por favor, insira um número de WhatsApp válido com DDD (ex: 11999999999).",
      };
    }

    await prisma.shop.update({
      where: { id: user.shopId },
      data: { phone: cleanNumber },
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Erro ao atualizar telefone no banco:", error);
    return { success: false, error: "Erro interno ao salvar o novo número." };
  }
}

// -----------------------------------------------------------------------------
// ACTIONS DE INTEGRAÇÃO COM WHATSAPP / PILOT STATUS
// -----------------------------------------------------------------------------

export async function getPairingCodeAction(phoneNumber: string) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return { success: false, error: "Acesso não autorizado." };
  }

  const shopId = user.shopId;

  try {
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: { name: true, slug: true, whatsappInstance: true },
    });

    if (!shop) {
      return { success: false, error: "Barbearia não encontrada." };
    }

    let cleanNumber = phoneNumber.replace(/\D/g, "");
    if (!cleanNumber.startsWith("55")) cleanNumber = `55${cleanNumber}`;
    const formattedPhone = `+${cleanNumber}`;

    const baseUrl = getPilotStatusBaseUrl();
    const apiKey = getWhatsAppApiKey();

    if (!apiKey) {
      return {
        success: false,
        error: "Chave API de integração não configurada.",
      };
    }

    let numberDetails = await findPilotStatusNumber(
      baseUrl,
      apiKey,
      cleanNumber,
    );

    let targetNumberId: string | number | null =
      numberDetails?.numberId ?? null;
    let targetInstanceId: string | number | null =
      numberDetails?.instanceId ?? null;

    let initialQrCode: string | null = null;
    let initialPairingCode: string | null = null;

    if (!targetNumberId || !targetInstanceId) {
      const createRes = await fetch(`${baseUrl}/numbers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          name: shop.name || shop.slug,
          number: formattedPhone,
        }),
      });

      const createData = await createRes.json();

      if (!createRes.ok) {
        const errMsg =
          createData.message ||
          createData.error ||
          `Erro HTTP ${createRes.status} ao criar número no Pilot Status.`;
        return { success: false, error: errMsg };
      }

      initialQrCode = createData.qrcodeBase64 || null;
      initialPairingCode = createData.pairingCode || null;

      numberDetails = await findPilotStatusNumber(baseUrl, apiKey, cleanNumber);

      const instanceObj = createData.instance || {};
      targetNumberId =
        numberDetails?.numberId ||
        createData.id ||
        createData.whatsappNumberId ||
        null;
      targetInstanceId =
        numberDetails?.instanceId || instanceObj.id || createData.id || null;
    }

    if (!targetInstanceId) {
      return {
        success: false,
        error:
          "Não foi possível obter um ID de instância válido no Pilot Status.",
      };
    }

    const connectRes = await fetch(
      `${baseUrl}/numbers/${targetInstanceId}/connect?number=${cleanNumber}`,
      {
        headers: { "x-api-key": apiKey },
        cache: "no-store",
      },
    );
    const connectData = await connectRes.json();

    const finalNumberId = String(targetNumberId || targetInstanceId);

    await prisma.shop.update({
      where: { id: shopId },
      data: {
        whatsappInstance: finalNumberId,
        whatsappToken: cleanNumber,
      },
    });

    await setWebhookForInstance(finalNumberId);
    await setInstanceSettings(finalNumberId);

    return {
      success: true,
      pairingCode:
        connectData.pairingCode ||
        connectData.code ||
        initialPairingCode ||
        null,
      qrcodeBase64:
        connectData.qrcodeBase64 || connectData.qrcode || initialQrCode || null,
      instanceId: String(targetInstanceId),
    };
  } catch (error) {
    console.error("Erro na integração com Pilot Status:", error);
    return {
      success: false,
      error: "Erro interno no servidor.",
    };
  }
}

export async function disconnectWhatsAppAction(instanceName: string) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return { success: false, error: "Acesso não autorizado." };
  }

  try {
    const baseUrl = getPilotStatusBaseUrl();
    const apiKey = getWhatsAppApiKey();

    if (!apiKey) {
      return { success: false, error: "Chave API não configurada." };
    }

    let numberId = instanceName;
    const shop = await prisma.shop.findUnique({
      where: { id: user.shopId },
      select: { whatsappInstance: true },
    });

    if (shop?.whatsappInstance) {
      numberId = shop.whatsappInstance;
    }

    const url = `${baseUrl}/numbers/${numberId}/logout`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error:
          errorData.message ||
          errorData.error ||
          `Falha ao desconectar no provedor (Status ${response.status}).`,
      };
    }

    await new Promise((res) => setTimeout(res, 2000));

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Erro ao desconectar WhatsApp:", error);
    return {
      success: false,
      error: "Erro interno no servidor ao tentar desconectar.",
    };
  }
}

export async function checkWhatsAppStatusAction() {
  const user = await getSessionUser();
  if (!user) {
    return { connected: false, state: "CLOSE" };
  }

  try {
    const shop = await prisma.shop.findUnique({
      where: { id: user.shopId },
      select: { whatsappInstance: true, whatsappToken: true },
    });

    if (!shop || (!shop.whatsappInstance && !shop.whatsappToken)) {
      return { connected: false, state: "CLOSE" };
    }

    const targetId = shop.whatsappInstance || shop.whatsappToken;
    const baseUrl = getPilotStatusBaseUrl();
    const apiKey = getWhatsAppApiKey();

    if (!apiKey) {
      return { connected: false, state: "CLOSE" };
    }

    const response = await fetch(`${baseUrl}/numbers/${targetId}/status`, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return { connected: false, state: "CLOSE" };
    }

    const data = await response.json();
    const stateUpper = String(data.state || data.status || "").toUpperCase();
    const isConnected =
      stateUpper === "OPEN" ||
      stateUpper === "CONNECTED" ||
      data.connected === true;

    return {
      connected: isConnected,
      state: isConnected ? "OPEN" : stateUpper || "CLOSE",
    };
  } catch (error) {
    console.error("Erro ao verificar status na Pilot Status:", error);
    return { connected: false, state: "CLOSE" };
  }
}
