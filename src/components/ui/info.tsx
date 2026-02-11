import { AppointmentsListProps } from "@/types/types";
import { FaDollarSign } from "react-icons/fa";
import { MdOutlineCalendarToday, MdOutlineCancel } from "react-icons/md";

export default function Info({ appointments }: AppointmentsListProps) {
  const confirmed = appointments.filter((a) => a.status !== "CANCELED");
  const cancelados = appointments.filter((a) => a.status === "CANCELED");

  const formattedPrice = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(
    confirmed.reduce((acc, curr) => acc + Number(curr.service.price), 0),
  );

  return (
    <div className="my-3 flex flex-col gap-3">
      <section className="flex flex-col gap-3 md:flex-row md:justify-between">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 md:p-6 md:flex-1">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-neutral-400 text-xs md:text-sm mb-1">
                Agendamentos Hoje
              </p>
              <p className="text-neutral-50 text-2xl md:text-3xl">
                {appointments.length}
              </p>
            </div>
            <div className="bg-blue-600/10 p-2 md:p-3 rounded-lg">
              <MdOutlineCalendarToday className="text-blue-500" />
            </div>
          </div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 md:p-6 md:flex-1">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-neutral-400 text-xs md:text-sm mb-1">
                Total Arrecadado
              </p>
              <p className="text-neutral-50 text-2xl md:text-3xl">
                {formattedPrice}
              </p>
            </div>
            <div className="bg-green-600/10 p-2 md:p-3 rounded-lg">
              <FaDollarSign className="w-5 h-5 md:w-6 md:h-6 text-green-500" />
            </div>
          </div>
        </div>
      </section>
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 md:p-6 sm:col-span-2 lg:col-span-1">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-neutral-400 text-xs md:text-sm mb-1">
              Cancelamentos
            </p>
            <p className="text-neutral-50 text-2xl md:text-3xl">
              {cancelados.length}
            </p>
          </div>
          <div className="bg-red-600/10 p-2 md:p-3 rounded-lg">
            <MdOutlineCancel className="w-5 h-5 md:w-6 md:h-6 text-red-500" />
          </div>
        </div>
      </div>
    </div>
  );
}
