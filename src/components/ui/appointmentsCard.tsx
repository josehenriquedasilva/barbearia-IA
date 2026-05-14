"use client";

import { AppointmentCardProps } from "@/types/types";
import { formatPhone, formatTime } from "@/utils/formatters";
import { BiPhone, BiUser } from "react-icons/bi";
import { BsClock, BsScissors } from "react-icons/bs";
import { useEffect, useState } from "react";

export default function AppointmentsCard({
  appointment,
  onOpenCancelModal,
}: AppointmentCardProps) {
  const [isPastTime, setIsPastTime] = useState(false);

  useEffect(() => {
    if (appointment.status !== "CONFIRMED") return;

    const endTime = new Date(appointment.endTime).getTime();
    const checkTime = () => {
      const now = new Date().getTime();
      if (now >= endTime) setIsPastTime(true);
    };

    checkTime();
    const interval = setInterval(checkTime, 60000);
    return () => clearInterval(interval);
  }, [appointment]);

  const isActuallyCompleted = appointment.status === "COMPLETED" || isPastTime;
  const isConfirmed = appointment.status === "CONFIRMED" && !isPastTime;
  const isCanceled = appointment.status === "CANCELED";
  const formattedPhone = formatPhone(appointment.clientPhone);

  return (
    <div
      className={`bg-neutral-800/50 border border-neutral-700 
      ${isConfirmed ? "hover:border-amber-600/50" : ""} 
      ${isActuallyCompleted ? "border-green-900/30 bg-green-900/10 shadow-sm" : ""}
      rounded-lg p-3 md:p-4 transition-all duration-300`}
    >
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3 md:gap-4">
        <div className="flex-1 space-y-3 w-full">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {/* Ícone muda de cor se concluído */}
              <div
                className={`${isActuallyCompleted ? "bg-green-600/20" : "bg-amber-600/10"} p-2 rounded transition-colors`}
              >
                <BsScissors
                  className={`w-4 h-4 ${isActuallyCompleted ? "text-green-500" : "text-amber-500"}`}
                />
              </div>
              <div>
                <p
                  className={`text-sm md:text-base text-neutral-50 ${isCanceled ? "line-through opacity-50" : ""}`}
                >
                  {appointment.service.name}
                </p>
                <span className="text-xs text-neutral-400">
                  R$ {appointment.service.price}
                </span>
              </div>
            </div>

            {isCanceled && (
              <span className="text-[10px] uppercase font-bold tracking-wider bg-red-900/30 text-red-400 px-2 py-1 rounded">
                Cancelado
              </span>
            )}
            {isActuallyCompleted && (
              <span className="text-[10px] uppercase font-bold tracking-wider bg-green-900/40 text-green-400 px-2 py-1 rounded border border-green-500/20">
                Concluído
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 md:gap-4 text-xs md:text-sm flex-wrap">
            <div className="flex items-center gap-2 text-neutral-400">
              <BsClock className="w-4 h-4" />
              <span>{formatTime(appointment.startTime)}</span>
            </div>
            <div className="text-neutral-500">
              {appointment.service.durationMinutes} min
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2 border-t border-neutral-700">
            <div className="flex items-center gap-2 text-xs md:text-sm">
              <BiUser className="w-4 h-4 text-neutral-500" />
              <span className="text-neutral-300">{appointment.clientName}</span>
            </div>
            <div className="flex items-center gap-2 text-xs md:text-sm">
              <BiPhone className="w-4 h-4 text-neutral-500" />
              <span className="text-neutral-400">{formattedPhone}</span>
            </div>
          </div>
        </div>

        {isConfirmed && (
          <button
            onClick={() => onOpenCancelModal?.(appointment)}
            className="w-full sm:w-auto px-4 py-2 bg-red-600/10 hover:bg-red-600 hover:text-white text-red-400 rounded-lg transition-all border border-red-600/20 text-sm cursor-pointer"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}
