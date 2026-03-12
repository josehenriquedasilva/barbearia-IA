import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import DashboardView from "./dashboardView";
import prisma from "@/lib/db";

export default async function Page(props: {
  params: Promise<{ barberId: string }>;
}) {
  const params = await props.params;
  const idFromUrl = params.barberId;

  const cookieStore = await cookies();
  const cookie = cookieStore.get("auth_token");
  const userIdFromCookie = cookie?.value?.trim();

  if (!userIdFromCookie || userIdFromCookie !== idFromUrl) {
    console.log("🚫 Acesso negado: Cookie e ID não batem");
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
