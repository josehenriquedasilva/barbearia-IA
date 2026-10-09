"use client";

import Appointments from "@/components/appointmentsList";
import Calendar from "@/components/calendar";
import MobileMenu from "@/components/mobileMenu";
import CancelModal from "@/components/pop-up/cancelModal";
import ClosedDaysModal from "@/components/pop-up/closedDaysModal";
import ManageBarbersModal from "@/components/pop-up/manageBarbersModal";
import SettingsModal from "@/components/pop-up/settingsModal";
import SubscriptionModal from "@/components/pop-up/subscriptionModal";

import Info from "@/components/ui/info";
import User from "@/components/ui/user";

import {
  AppointmentData,
  BarbersData,
  DashboardViewProps,
  Service,
  SettingsPayload,
} from "@/types/types";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IoMenu } from "react-icons/io5";
import { RiScissorsFill, RiVipCrown2Fill } from "react-icons/ri";

import useSWR from "swr";
import {
  createBarberAction,
  getBarbersAction,
  logout,
  updateAppointmentsStatusAction,
  updateClosedDays,
  updateServicesAction,
} from "../../actions";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function DashboardView({ user, isAdmin }: DashboardViewProps) {
  const router = useRouter();

  const shopId = user.shopId || user.shop?.id;

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewBarberId, setViewBarberId] = useState(user.id);
  const [viewBarberName, setViewBarberName] = useState(user.name);
  const [barbers, setBarbers] = useState<BarbersData[]>([]);
  const [menu, setMenu] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isBarberModal, setIsBarberModal] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isClosedDaysOpen, setIsClosedDaysOpen] = useState(false);
  const [closedDays, setClosedDays] = useState<
    { date: string; reason: string }[]
  >(user.shop?.closedDays || []);
  const [services, setServices] = useState<Service[]>(
    user.shop?.services || [],
  );

  const dateString = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;

  const currentViewUser = {
    ...user,
    id: viewBarberId,
    name: viewBarberName,
  };

  const [selectedAppointment, setSelectedAppointment] =
    useState<AppointmentData | null>(null);

  const {
    data: appointments,
    error,
    isLoading,
    mutate,
  } = useSWR(
    `/api/appointments?barberId=${viewBarberId}&date=${dateString}`,
    fetcher,
    {
      refreshInterval: 5000,
      revalidateOnFocus: true,
    },
  );

  useEffect(() => {
    async function loadBarbers() {
      const data = await getBarbersAction();
      if (Array.isArray(data)) {
        setBarbers(data);
      }
    }
    loadBarbers();
  }, []);

  useEffect(() => {
    async function syncStatus() {
      const now = new Date();
      const hasPendingStatus =
        Array.isArray(appointments) &&
        appointments.some(
          (a: AppointmentData) =>
            a.status === "CONFIRMED" && new Date(a.endTime) < now,
        );

      if (hasPendingStatus) {
        await updateAppointmentsStatusAction();
        mutate();
      }
    }

    syncStatus();
    const interval = setInterval(syncStatus, 10000);
    return () => clearInterval(interval);
  }, [appointments, mutate]);

  const handleSaveSettings = async (payload: SettingsPayload) => {
    try {
      const result = await updateServicesAction(payload);

      if (result?.success) {
        if (payload.services) {
          setServices(payload.services);
        }
        setIsSettingsOpen(false);
        router.refresh();
      } else {
        alert(
          result?.error || "Erro ao salvar configurações do estabelecimento",
        );
      }
    } catch (error) {
      console.error("Erro ao atualizar configurações:", error);
      alert("Erro ao salvar configurações do estabelecimento.");
    }
  };

  const handleCreateBarber = async (data: {
    name: string;
    email: string;
    password: string;
  }) => {
    try {
      const result = await createBarberAction(data);

      if (result?.success) {
        const updatedBarbers = await getBarbersAction();
        if (Array.isArray(updatedBarbers)) {
          setBarbers(updatedBarbers);
        }
        router.refresh();
        return { success: true };
      } else {
        return {
          success: false,
          error: result?.error || "Erro ao criar barbeiro.",
        };
      }
    } catch (error) {
      console.error("Erro ao criar barbeiro:", error);
      return { success: false, error: "Erro interno no servidor." };
    }
  };

  const handleSaveClosedDays = async (
    days: { date: string; reason: string }[],
  ) => {
    try {
      const result = await updateClosedDays(days);

      if (result?.success) {
        setClosedDays(days);
        setIsClosedDaysOpen(false);
        router.refresh();
      } else {
        alert(result?.error || "Erro ao salvar dias fechados");
      }
    } catch (error) {
      console.error(`Erro ao salvar dias fechados: ${error}`);
      alert("Ocorreu um erro ao salvar os dias fechados.");
    }
  };

  const subStatus = user.shop?.subscriptionStatus || "TRIAL";
  const subEnd = user.shop?.subscriptionEnd
    ? new Date(user.shop.subscriptionEnd)
    : null;

  const getSubscriptionInfo = () => {
    const planName =
      user.shop?.plan === "SILVER" ? "Plano Prata" : "Plano Bronze";

    let daysRemaining: number | null = null;
    let formattedDate = "";

    if (subEnd) {
      const now = new Date();
      const diffTime = subEnd.getTime() - now.getTime();
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      formattedDate = subEnd.toLocaleDateString("pt-BR");
    }

    if (subStatus === "PENDING_APPROVAL") {
      return {
        badgeColor: "bg-amber-500",
        badgePing: "bg-amber-400",
        statusText: "Pagamento em Análise",
        description: "Acesso temporário liberado (Tolerância 48h)",
        buttonText: "Ver Status",
        planName,
      };
    }

    if (
      subStatus === "EXPIRED" ||
      (daysRemaining !== null && daysRemaining <= 0)
    ) {
      return {
        badgeColor: "bg-rose-500",
        badgePing: "bg-rose-400",
        statusText:
          subStatus === "TRIAL"
            ? "Período de Teste Vencido"
            : "Assinatura Vencida",
        description:
          "Assine um plano para continuar utilizando o sistema sem interrupções",
        buttonText: "Ativar Assinatura",
        planName,
      };
    }

    if (subStatus === "TRIAL") {
      return {
        badgeColor: "bg-sky-500",
        badgePing: "bg-sky-400",
        statusText: "Teste Grátis Ativo",
        description:
          daysRemaining !== null
            ? `Você tem ${daysRemaining} ${daysRemaining === 1 ? "dia restante" : "dias restantes"} de teste grátis`
            : "Período de 7 dias de teste grátis ativo",
        buttonText: "Ativar Assinatura",
        planName: `${planName}`,
      };
    }

    const isNearExpiration = daysRemaining !== null && daysRemaining <= 10;

    return {
      badgeColor: isNearExpiration ? "bg-amber-500" : "bg-emerald-500",
      badgePing: isNearExpiration ? "bg-amber-400" : "bg-emerald-400",
      statusText: isNearExpiration ? "Vencendo em breve" : "Ativo",
      description: formattedDate
        ? `Vence em ${formattedDate} (${daysRemaining} dia${daysRemaining === 1 ? "" : "s"})`
        : "Acesso ativo",
      buttonText: isNearExpiration ? "Renovar Antecipado" : "Gerenciar Plano",
      planName,
    };
  };

  const subInfo = getSubscriptionInfo();

  return (
    <div className="min-h-screen bg-neutral-950">
      {/* CABEÇALHO */}
      <header className="flex bg-neutral-900 border-b border-neutral-800 h-18">
        <div className="flex w-full items-center px-3 py-2 gap-2 max-w-[900px] mx-auto">
          <IoMenu
            onClick={() => setMenu(true)}
            className="size-8.5 text-neutral-50 mr-1.5 cursor-pointer p-1 rounded-md hover:bg-neutral-800 duration-150"
          />
          <RiScissorsFill className="bg-amber-600 p-1 size-7 rounded-md" />
          <h1 className="text-neutral-50 font-semibold">{user.shop?.name}</h1>
        </div>

        <div className="flex items-center mr-3 gap-2">
          <button
            onClick={() => logout()}
            className="px-4 py-2 text-sm text-neutral-300 hover:text-neutral-50 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
          >
            Sair
          </button>
        </div>
      </header>

      <MobileMenu
        barbers={barbers}
        isAdmin={isAdmin}
        menuOpen={menu}
        menuClose={() => setMenu(false)}
        baberModalOpen={() => setIsBarberModal(true)}
        setViewBarberId={setViewBarberId}
        setViewBarberName={setViewBarberName}
        setMenu={setMenu}
        viewBarberId={viewBarberId}
        plan={user.shop?.plan}
        onOpenSubscriptionModal={() => setIsUpgradeModalOpen(true)}
      />

      <main className="px-3.5 py-5 max-w-[900px] mx-auto">
        {isAdmin && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 mb-5 flex items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-3">
              <div className="bg-amber-500/10 p-2 rounded-lg border border-amber-500/20 text-amber-500">
                <RiVipCrown2Fill className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-neutral-400">{subInfo.planName}</p>
                  <span className="flex h-2 w-2 relative">
                    <span
                      className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${subInfo.badgePing}`}
                    ></span>
                    <span
                      className={`relative inline-flex rounded-full h-2 w-2 ${subInfo.badgeColor}`}
                    ></span>
                  </span>
                  <span className="text-xs font-semibold text-neutral-300">
                    ({subInfo.statusText})
                  </span>
                </div>
                <p className="text-xs font-medium text-neutral-400 mt-0.5">
                  {subInfo.description}
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsUpgradeModalOpen(true)}
              className="bg-amber-600 hover:bg-amber-500 text-neutral-950 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shadow-md shadow-amber-600/10 cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              {subInfo.buttonText}
            </button>
          </div>
        )}

        <section className="text-neutral-50">
          {isAdmin && viewBarberId !== user.id && (
            <div className="bg-amber-600/10 border border-amber-600/20 rounded-xl p-2 mb-6 flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-300 gap-2">
              <div className="flex items-center gap-3">
                <div className="bg-amber-600 p-2 rounded-full text-neutral-900">
                  <RiScissorsFill className="size-4" />
                </div>
                <div>
                  <p className="text-amber-500 text-xs uppercase tracking-wider font-bold">
                    Visualizando Agenda de:
                  </p>
                  <p className="text-neutral-50 font-semibold">
                    {viewBarberName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setViewBarberId(user.id);
                  setViewBarberName(user.name);
                }}
                className="bg-amber-600 hover:bg-amber-700 text-neutral-950 px-1.5 py-2.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                Voltar para mim
              </button>
            </div>
          )}
          <User
            user={currentViewUser}
            isAdmin={isAdmin}
            setMenu={setMenu}
            isSettingOpen={() => setIsSettingsOpen(true)}
          />
          {error && (
            <div className="bg-red-900/20 border border-red-800 text-red-400 p-4 rounded-xl mb-6 text-sm my-5">
              Erro ao carregar agendamentos. Verifique sua conexão.
            </div>
          )}
          {isLoading ? (
            <div className="flex flex-col gap-4 my-5">
              <div className="h-24 w-full bg-neutral-900 animate-pulse rounded-xl border border-neutral-800" />
              <div className="h-64 w-full bg-neutral-900 animate-pulse rounded-xl border border-neutral-800" />
            </div>
          ) : (
            <Info
              appointments={Array.isArray(appointments) ? appointments : []}
              shopId={shopId}
              slug={user.shop?.slug}
              shopPhone={user.shop?.phone}
              isAdmin={isAdmin}
            />
          )}
        </section>

        <section>
          <Calendar
            isAdmin={isAdmin}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            isOpenClosedDaysModal={() => setIsClosedDaysOpen(true)}
            closedDays={closedDays.map((d) => d.date)}
          />
        </section>

        <section className="my-3.5">
          <Appointments
            appointments={Array.isArray(appointments) ? appointments : []}
            onOpenCancelModal={(appointment) =>
              setSelectedAppointment(appointment)
            }
          />
        </section>
      </main>

      {/* MODAIS */}
      {isSettingsOpen && (
        <SettingsModal
          key="settings-modal"
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          shop={user.shop}
          services={services}
          onSave={handleSaveSettings}
        />
      )}

      {isClosedDaysOpen && (
        <ClosedDaysModal
          isOpen={isClosedDaysOpen}
          onClose={() => setIsClosedDaysOpen(false)}
          closedDays={closedDays}
          onSave={handleSaveClosedDays}
        />
      )}

      {/* MODAL DE ADICIONAR BARBEIRO COM HANDLER DE UPGRADE */}
      {isBarberModal && (
        <ManageBarbersModal
          barberModalClose={() => setIsBarberModal(false)}
          onAddBarber={handleCreateBarber}
          currentBarbersCount={barbers.length}
          plan={user.shop?.plan}
          onOpenSubscriptionModal={() => setIsUpgradeModalOpen(true)}
        />
      )}

      {selectedAppointment && (
        <CancelModal
          appointment={selectedAppointment}
          modalClose={() => setSelectedAppointment(null)}
          mutate={mutate}
        />
      )}

      {/* MODAL DE ASSINATURA E RENOVAÇÃO */}
      {shopId && (
        <SubscriptionModal
          shopId={shopId}
          isOpen={isUpgradeModalOpen}
          onClose={() => setIsUpgradeModalOpen(false)}
          currentPlan={user.shop?.plan}
          subscriptionStatus={user.shop?.subscriptionStatus}
          subscriptionEnd={user.shop?.subscriptionEnd}
        />
      )}
    </div>
  );
}
