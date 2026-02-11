"use client";

import Appointments from "@/components/appointmentsList";
import Calendar from "@/components/calendar";
import MobileMenu from "@/components/mobileMenu";
import DeleteConfimation from "@/components/pop-up/deleteConfirmation";
import Info from "@/components/ui/info";
import User from "@/components/ui/user";
import { UserData } from "@/types/types";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { IoMenu } from "react-icons/io5";
import { RiScissorsFill } from "react-icons/ri";

export default function Home() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [menu, setMenu] = useState(false);
  const params = useParams();
  const [user, setUser] = useState<UserData | null>(null);
  const [appointments, setAppointments] = useState<[]>([]);

  useEffect(() => {
    if (params.barberId) {
      infoUser(params.barberId as string);
      getAppointments(params.barberId as string);
    }
  }, [params.barberId]);

  const infoUser = async (id: string) => {
    try {
      const response = await fetch(`/api/user?id=${id}`);

      if (!response.ok) {
        throw new Error("Erro ao buscar barbeiro");
      }

      const data = await response.json();
      setUser(data);
    } catch (erro) {
      console.log(erro);
    }
  };

  const getAppointments = async (id: string) => {
    try {
      const response = await fetch(`/api/appointments?id=${id}`);

      if (!response.ok) {
        throw new Error("Erro ao buscar agendamentos");
      }
      console.log(response);
      const data = await response.json();
      setAppointments(data);
    } catch (erro) {
      console.log(erro);
    }
  };

  return (
    <div className="bg-neutral-950">
      <div
        className={`z-10 absolute left-[-220px] bg-neutral-900 h-full transition-all duration-200 ${
          menu ? `translate-x-55` : `translate-x-0`
        }`}
      >
        <MobileMenu setMenu={setMenu} />
      </div>

      <header className="flex bg-neutral-900 border-b border-neutral-800 h-18">
        <div className="flex w-full items-center px-3 py-2 gap-2 max-w-[900px] mx-auto">
          <IoMenu
            onClick={() => setMenu(true)}
            className="size-8.5 text-neutral-50 mr-1.5 cursor-pointer p-1 rounded-md hover:bg-neutral-800 duration-150"
          />
          <RiScissorsFill className="bg-amber-600 p-1 size-7 rounded-md" />
          <h1 className="text-neutral-50 font-semibold">
            Roberto Simão | Barbearia
          </h1>
        </div>
      </header>

      <main className="px-3.5 py-5 max-w-[900px] mx-auto">
        <section className="text-neutral-50">
          <User user={user ?? undefined} />
          {/*Info*/}
          <Info appointments={appointments} />
        </section>
        <section>
          <Calendar
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        </section>
        <section className="my-3.5">
          <Appointments appointments={appointments} />
        </section>
      </main>

      {/* Pop-up de confirmação de cancelamento */}
      {/*
      <section className="z-10 absolute top-1/4 m-2.5 py-3 bg-neutral-900">
        <DeleteConfimation />
      </section>
      */}
    </div>
  );
}
