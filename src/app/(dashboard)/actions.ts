"use server";

import prisma from "@/lib/db";
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

// Helper para garantir a URL base correta com /v1
function getPilotStatusBaseUrl() {
  let rawBaseUrl =
    process.env.PILOT_STATUS_NATIVE_URL || "https://pilotstatus.com.br";
  let baseUrl = rawBaseUrl.replace(/\/$/, "");
  return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
}

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

// Concluir agendamentos (auto)
export async function updateAppointmentsStatusAction(shopId: number) {
  try {
    const now = new Date();

    await prisma.appointment.updateMany({
      where: {
        shopId,
        status: "CONFIRMED",
        endTime: { lt: now },
      },
      data: {
        status: "COMPLETED",
      },
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Erro ao atualizar status:", error);
    return { success: false };
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
      include: { service: true, barber: true, shop: true },
    });

    if (!app) {
      return { success: false, error: "Agendamento não encontrado." };
    }

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: "CANCELED", cancelReason: reason },
    });

    const message = `Olá *${app.clientName}*, infelizmente seu agendamento para o dia ${app.startTime.toLocaleDateString("pt-BR")} às ${app.startTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} foi *cancelado* pela barbearia.\n\n*Motivo:* ${reason}.
    Veja outro horário disponível enviando uma mensagem por aqui.`;

    const instanceName = app.shop.whatsappInstance || app.shop.slug;
    await sendWhatsAppMessage(instanceName, app.clientPhone, message);

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
      const shop = await tx.shop.findUnique({
        where: { id: shopId },
        select: { slug: true, whatsappInstance: true },
      });
      const instanceName = shop?.whatsappInstance || shop?.slug || "";

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

          const msg = `Olá *${app.clientName}*, estamos entrando em contato para informar que a barbearia estará fechada no dia ${day.date} (*Motivo: ${day.reason}*). Por isso, seu agendamento foi cancelado. Por favor, escolha uma nova data enviando uma mensagem por aqui.`;

          await sendWhatsAppMessage(instanceName, app.clientPhone, msg);
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
      const shop = await tx.shop.findUnique({
        where: { id: shopId },
        select: { slug: true, whatsappInstance: true },
      });
      const instanceName = shop?.whatsappInstance || shop?.slug || "";

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

          const msg = `Olá *${app.clientName}*, informamos que o serviço *${service.name}* não está mais disponível em nossa unidade. Por este motivo, seu agendamento para o dia ${app.startTime.toLocaleDateString("pt-BR")} foi cancelado. Por favor, verifique nossos outros serviços disponíveis enviando uma mensagem por aqui.`;

          await sendWhatsAppMessage(instanceName, app.clientPhone, msg);
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
      const items = Array.isArray(numbersList)
        ? numbersList
        : numbersList.data || numbersList.numbers || [];

      const found = items.find((item: any) => {
        const itemPhone = (
          item.number?.number ||
          item.number ||
          item.phone ||
          ""
        )
          .toString()
          .replace(/\D/g, "");
        return (
          itemPhone.includes(cleanNumber) || cleanNumber.includes(itemPhone)
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

// Gerar código de conexão com IA
export async function getPairingCodeAction(
  shopId: number,
  phoneNumber: string,
) {
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

    let rawBaseUrl =
      process.env.PILOT_STATUS_NATIVE_URL || "https://pilotstatus.com.br";
    let baseUrl = rawBaseUrl.replace(/\/$/, "");
    if (!baseUrl.endsWith("/v1")) {
      baseUrl = `${baseUrl}/v1`;
    }

    const apiKey =
      process.env.EVOLUTION_TENANT_KEY ||
      process.env.PILOT_STATUS_API_KEY ||
      process.env.WHATSAPP_API_KEY;

    if (!apiKey) {
      return {
        success: false,
        error: "Chave API (EVOLUTION_TENANT_KEY) não configurada.",
      };
    }

    // 1. Busca se o número já existe no Pilot Status
    let numberDetails = await findPilotStatusNumber(
      baseUrl,
      apiKey,
      cleanNumber,
    );

    let targetNumberId = numberDetails?.numberId || null;
    let targetInstanceId = numberDetails?.instanceId || null;

    let initialQrCode: string | null = null;
    let initialPairingCode: string | null = null;

    // 2. Se o número não existe, cria um novo
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

      console.log(
        "[DEBUG CREATE DATA DETALHADO]:",
        JSON.stringify(createData, null, 2),
      );

      initialQrCode = createData.qrcodeBase64 || null;
      initialPairingCode = createData.pairingCode || null;

      // Consulta novamente o GET /v1/numbers para capturar o WhatsAppNumber.id recém-criado
      numberDetails = await findPilotStatusNumber(baseUrl, apiKey, cleanNumber);

      const instanceObj = createData.instance || {};
      targetNumberId =
        numberDetails?.numberId || createData.id || createData.whatsappNumberId;
      targetInstanceId =
        numberDetails?.instanceId || instanceObj.id || createData.id;
    }

    if (!targetInstanceId) {
      return {
        success: false,
        error:
          "Não foi possível obter um ID de instância válido no Pilot Status.",
      };
    }

    // 3. Conecta para obter o Código de Pareamento / QR Code
    const connectRes = await fetch(
      `${baseUrl}/numbers/${targetInstanceId}/connect?number=${cleanNumber}`,
      {
        headers: { "x-api-key": apiKey },
        cache: "no-store",
      },
    );
    const connectData = await connectRes.json();

    const finalNumberId = targetNumberId || targetInstanceId;

    // 4. Salva o ID do número no banco de dados para ser usado nos envios e webhooks
    await prisma.shop.update({
      where: { id: shopId },
      data: {
        whatsappInstance: finalNumberId,
        whatsappToken: cleanNumber,
      },
    });

    // 5. Registra o Webhook usando o ID correto do Número
    await setWebhookForInstance(finalNumberId);

    // 6. Aplica as configurações (desativa histórico antigo e ignora grupos)
    const instanceDisplayName = shop.name || shop.slug || finalNumberId;
    await setInstanceSettings(instanceDisplayName);

    return {
      success: true,
      pairingCode:
        connectData.pairingCode ||
        connectData.code ||
        initialPairingCode ||
        null,
      qrcodeBase64:
        connectData.qrcodeBase64 || connectData.qrcode || initialQrCode || null,
      instanceId: targetInstanceId,
    };
  } catch (error) {
    console.error("Erro na integração com Pilot Status:", error);
    return {
      success: false,
      error: "Erro interno no servidor.",
    };
  }
}

// Desconexão da instancia "IA"
export async function disconnectWhatsAppAction(
  shopId: number,
  instanceName: string,
) {
  try {
    const rawBaseUrl = getPilotStatusBaseUrl() || "https://pilotstatus.com.br";

    // Garante que a URL base termine com /v1
    let baseUrl = rawBaseUrl.replace(/\/$/, "");
    if (!baseUrl.endsWith("/v1")) {
      baseUrl = `${baseUrl}/v1`;
    }

    const apiKey = process.env.EVOLUTION_TENANT_KEY as string;

    // 1. Garante que estamos usando o ID real do número no Pilot Status e não o slug
    let numberId = instanceName;
    if (shopId) {
      const shop = await prisma.shop.findUnique({
        where: { id: shopId },
        select: { whatsappInstance: true },
      });
      if (shop?.whatsappInstance) {
        numberId = shop.whatsappInstance;
      }
    }

    // 2. Endpoint oficial de logout: POST /v1/numbers/{id}/logout
    const url = `${baseUrl}/numbers/${numberId}/logout`;

    console.log(
      `[WhatsApp Logout] Desconectando instância ${numberId} via ${url}...`,
    );

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Erro no logout do Pilot Status:", errorData);
      return {
        success: false,
        error:
          errorData.message ||
          errorData.error ||
          `A API do Pilot Status recusou o comando de desconexão (Status ${response.status}).`,
      };
    }

    const data = await response.json().catch(() => ({}));
    console.log("[WhatsApp Logout Sucesso]:", data);

    // Aguarda um pequeno tempo para sincronização
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

// Verificar status da conexão com IA
export async function checkWhatsAppStatusAction(shopId: number) {
  if (!shopId) {
    return { connected: false, state: "CLOSE" };
  }

  try {
    // Busca no banco o ID da instância registrado no Pilot Status para esta barbearia
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: { whatsappInstance: true, whatsappToken: true },
    });

    if (!shop || (!shop.whatsappInstance && !shop.whatsappToken)) {
      return { connected: false, state: "CLOSE" };
    }

    // Prioriza o whatsappInstance salvo no banco
    const targetId = shop.whatsappInstance || shop.whatsappToken;

    let rawBaseUrl =
      process.env.PILOT_STATUS_NATIVE_URL || "https://pilotstatus.com.br";
    let baseUrl = rawBaseUrl.replace(/\/$/, "");
    if (!baseUrl.endsWith("/v1")) {
      baseUrl = `${baseUrl}/v1`;
    }

    const apiKey =
      process.env.EVOLUTION_TENANT_KEY ||
      process.env.PILOT_STATUS_API_KEY ||
      process.env.WHATSAPP_API_KEY;

    const response = await fetch(`${baseUrl}/numbers/${targetId}/status`, {
      method: "GET",
      headers: {
        "x-api-key": apiKey as string,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return { connected: false, state: "CLOSE" };
    }

    const data = await response.json();

    // Trata letras maiúsculas e minúsculas (OPEN, open, CONNECTED, connected, etc.)
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

// Atualizar o número de telefone da barbearia
export async function updateShopPhoneAction(shopId: number, newPhone: string) {
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
      where: { id: shopId },
      data: { phone: cleanNumber },
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Erro ao atualizar telefone no banco:", error);
    return { success: false, error: "Erro interno ao salvar o novo número." };
  }
}
