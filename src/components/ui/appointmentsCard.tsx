import { AppointmentCardProps } from "@/types/types";
import { formatPhone, formatTime } from "@/utils/formatters";

import { BiPhone, BiUser } from "react-icons/bi";
import { BsClock, BsScissors } from "react-icons/bs";

export default function AppointmentsCard({
  appointment,
  onOpenCancelModal,
}: AppointmentCardProps) {
  const formattedPhone = formatPhone(appointment.clientPhone);

  return (
    <div
      className={`bg-neutral-800/50 border border-neutral-700 ${appointment.status == "CONFIRMED" ? "hover:border-amber-600/50" : ""} rounded-lg p-3 md:p-4 transition-all`}
    >
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3 md:gap-4">
        <div className="flex-1 space-y-3 w-full">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="bg-amber-600/10 p-2 rounded">
                <BsScissors className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <p
                  className={`text-sm md:text-base text-neutral-50 ${appointment.status == "CONFIRMED" ? "" : "line-through"}`}
                >
                  {appointment.service.name}
                </p>
                <div className="flex items-center gap-2 text-xs md:text-sm text-neutral-400">
                  <span>R$ {appointment.service.price}</span>
                </div>
              </div>
            </div>
            <span
              className={`text-xs bg-red-900/30 text-red-400 px-2 py-1 rounded ${appointment.status == "CONFIRMED" ? "hidden" : "block"}`}
            >
              Cancelado
            </span>
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

        <button
          onClick={() => onOpenCancelModal?.(appointment)}
          className={`w-full sm:w-auto px-4 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-400 rounded-lg transition-colors border border-red-600/20 text-sm cursor-pointer ${appointment.status == "CONFIRMED" ? "" : "hidden"}`}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
