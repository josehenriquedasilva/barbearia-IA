"use client";

import { AppointmentsListProps } from "@/types/types";
import AppointmentsCard from "./ui/appointmentsCard";
import { useEffect, useState } from "react";

export default function Appointments({
  appointments,
  onOpenCancelModal,
}: AppointmentsListProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 6000);
    return () => clearInterval(interval);
  }, []);

  const list = appointments || [];
  const now = new Date();

  const confirmed = list.filter((a) => {
    const isPast = new Date(a.endTime) <= now;
    return a.status === "CONFIRMED" && !isPast;
  });

  const completed = list.filter((a) => {
    const isPast = new Date(a.endTime) <= now;
    return a.status === "COMPLETED" || (a.status === "CONFIRMED" && isPast);
  });

  const canceled = list.filter((a) => a.status === "CANCELED");

  const isEmpty =
    confirmed.length === 0 && completed.length === 0 && canceled.length === 0;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 md:p-6">
      <section className="flex justify-between items-center mb-5">
        <h1 className="text-neutral-50 text-lg md:text-xl font-medium">
          Agendamentos do Dia
        </h1>
        <p className="text-xs md:text-sm text-neutral-400 bg-neutral-800 px-2 py-1 rounded-md">
          {list.length} {list.length === 1 ? "Total" : "Totais"}
        </p>
      </section>

      {isEmpty ? (
        <div className="text-center py-8 md:py-12">
          <p className="text-neutral-500 text-sm md:text-base">
            Nenhum agendamento para hoje
          </p>
        </div>
      ) : (
        <div className="space-y-6 max-h-[500px] md:max-h-[600px] overflow-y-auto pr-1 md:pr-2 custom-scrollbar">
          {confirmed.length > 0 && (
            <div className="space-y-3">
              {confirmed.map((appointment) => (
                <AppointmentsCard
                  key={appointment.id}
                  appointment={appointment}
                  onOpenCancelModal={onOpenCancelModal}
                />
              ))}
            </div>
          )}

          {completed.length > 0 && (
            <div className="pt-2 space-y-3">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-[1px] flex-1 bg-neutral-800"></div>
                <p className="text-[10px] text-green-500/70 font-bold uppercase tracking-widest px-2">
                  Concluídos ({completed.length})
                </p>
                <div className="h-[1px] flex-1 bg-neutral-800"></div>
              </div>
              {completed.map((appointment) => (
                <div
                  key={appointment.id}
                  className="opacity-60 grayscale-[0.3] transition-all hover:opacity-100 hover:grayscale-0"
                >
                  <AppointmentsCard
                    appointment={appointment}
                    onOpenCancelModal={() => {}}
                  />
                </div>
              ))}
            </div>
          )}

          {canceled.length > 0 && (
            <div className="pt-2 space-y-3">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-[1px] flex-1 bg-neutral-800"></div>
                <p className="text-[10px] text-red-500/70 font-bold uppercase tracking-widest px-2">
                  Cancelados ({canceled.length})
                </p>
                <div className="h-[1px] flex-1 bg-neutral-800"></div>
              </div>
              {canceled.map((appointment) => (
                <div key={appointment.id} className="opacity-50 grayscale">
                  <AppointmentsCard
                    appointment={appointment}
                    onOpenCancelModal={() => {}}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
