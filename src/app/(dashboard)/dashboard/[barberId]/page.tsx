import { redirect } from "next/navigation";
import DashboardView from "./dashboardView";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export default async function Page(props: {
  params: Promise<{ barberId: string }>;
}) {
  const params = await props.params;
  const idFromUrl = params.barberId;

  // Obtém o usuário autenticado a partir do token JWT no cookie
  const sessionUser = await getSessionUser();

  // Valida se há usuário logado e se o ID bate com a URL
  if (!sessionUser || String(sessionUser.id) !== idFromUrl) {
    console.log("🚫 Acesso negado: Sessão inválida ou ID não bate");
    redirect("/login");
  }

  const user = await prisma.barber.findUnique({
    where: { id: Number(idFromUrl) },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      shopId: true,
      shop: {
        include: {
          services: {
            where: {
              active: true,
            },
          },
          closedDays: true,
        },
      },
    },
  });

  if (!user) redirect("/login");

  const serializedUser = {
    ...user,
    shop: {
      ...user.shop,
      whatsappInstance: user.shop.whatsappInstance ?? "",
      whatsappToken: user.shop.whatsappToken ?? "",
      closedDays: user.shop.closedDays.map((d) => ({
        date: d.date,
        reason: d.reason ?? "Não informado",
      })),
      services: user.shop.services.map((s) => ({
        id: s.id,
        name: s.name,
        price: Number(s.price),
        duration: s.durationMinutes,
      })),
    },
  };

  const isAdmin = user.role === "ADMIN";

  return <DashboardView user={serializedUser} isAdmin={isAdmin} />;
}
