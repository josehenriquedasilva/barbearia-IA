"use client";

import Appointments from "@/components/appointmentsList";
import Calendar from "@/components/calendar";
import MobileMenu from "@/components/mobileMenu";
import CancelModal from "@/components/pop-up/cancelModal";
import ClosedDaysModal from "@/components/pop-up/closedDaysModal";
import ManageBarbersModal from "@/components/pop-up/manageBarbersModal";
import SettingsModal from "@/components/pop-up/settingsModal";

import Info from "@/components/ui/info";
import User from "@/components/ui/user";

import {
  AppointmentData,
  BarbersData,
  DashboardViewProps,
  Service,
  SettingsPayload,
} from "@/types/types";

import { useEffect, useState } from "react";
import { IoMenu } from "react-icons/io5";
import { RiScissorsFill } from "react-icons/ri";

import useSWR from "swr";
import {
  createBarberAction,
  getBarbersAction,
  logout,
  updateClosedDays,
  updateServicesAction,
} from "../../actions";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function DashboardView({ user, isAdmin }: DashboardViewProps) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewBarberId, setViewBarberId] = useState(user.id);
  const [viewBarberName, setViewBarberName] = useState(user.name);
  const [barbers, setBarbers] = useState<BarbersData[]>([]);
  const [menu, setMenu] = useState(false);
  const [isBarberModal, setIsBarberModal] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isClosedDaysOpen, setIsClosedDaysOpen] = useState(false);
  const [closedDays, setClosedDays] = useState<
    { date: string; reason: string }[]
  >(user.shop.closedDays || []);
  const [services, setServices] = useState<Service[]>(user.shop.services || []);
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
      const data = await getBarbersAction(user.shopId);
      setBarbers(data);
    }
    loadBarbers();
  }, [user.shopId]);

  const handleSaveSettings = async (payload: SettingsPayload) => {
    try {
      const result = await updateServicesAction(user.shopId, payload);

      if (result.success) {
        setServices(payload.services);
      } else {
        console.error(result.error);
      }
    } catch (error) {
      console.error("Erro ao atualizar serviços:", error);
    }
  };

  const handleCreateBarber = async (data: {
    name: string;
    email: string;
    password: string;
  }) => {
    try {
      const result = await createBarberAction(user.shopId, data);

      if (result.success) {
        const updatedBarbers = await getBarbersAction(user.shopId);
        setBarbers(updatedBarbers);

        return { success: true };
      } else {
        return { success: false, error: result.error };
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
      const result = await updateClosedDays(user.shopId, days);

      if (result.success) {
        setClosedDays(days);
      } else {
        alert(result.error);
      }
    } catch (error) {
      console.error(`Erro ao salvar dias fechados: ${error}`);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950">
      <header className="flex bg-neutral-900 border-b border-neutral-800 h-18">
        <div className="flex w-full items-center px-3 py-2 gap-2 max-w-[900px] mx-auto">
          <IoMenu
            onClick={() => setMenu(true)}
            className="size-8.5 text-neutral-50 mr-1.5 cursor-pointer p-1 rounded-md hover:bg-neutral-800 duration-150"
          />
          <RiScissorsFill className="bg-amber-600 p-1 size-7 rounded-md" />
          <h1 className="text-neutral-50 font-semibold">{user.shop.name}</h1>
        </div>
        <div className="flex items-center mr-3">
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
      />

      <main className="px-3.5 py-5 max-w-[900px] mx-auto">
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
            <>
              <Info
                appointments={appointments}
                shopInstance={user.shop.whatsappInstance}
                shopPhone={user.shop.phone}
              />
            </>
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
            appointments={appointments}
            onOpenCancelModal={(appointment) =>
              setSelectedAppointment(appointment)
            }
          />
        </section>
      </main>

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

      {isBarberModal && (
        <section className="z-60 m-2.5 py-3 bg-neutral-900">
          <ManageBarbersModal
            barberModalClose={() => setIsBarberModal(false)}
            onAddBarber={handleCreateBarber}
          />
        </section>
      )}

      {selectedAppointment && (
        <CancelModal
          appointment={selectedAppointment}
          modalClose={() => setSelectedAppointment(null)}
          mutate={mutate}
        />
      )}
    </div>
  );
}
