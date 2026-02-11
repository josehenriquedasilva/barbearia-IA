import { AppointmentsListProps } from "@/types/types";
import AppointmentsCard from "./ui/appointmentsCard";

export default function Appointments({ appointments }: AppointmentsListProps) {
  const confirmed = appointments.filter((a) => a.status !== "CANCELED");
  const canceled = appointments.filter((a) => a.status === "CANCELED");

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 md:p-6">
      <section className="flex justify-between items-center mb-5">
        <h1 className="text-neutral-50 text-lg md:text-xl">
          Agendamentos do Dia
        </h1>
        <p className="text-xs md:text-sm text-neutral-400">
          {appointments.length} Agendamentos
        </p>
      </section>
      <section className="flex flex-col gap-3.5 h-[400px] overflow-y-scroll">
        {confirmed.map((appointment) => (
          <AppointmentsCard key={appointment.id} appointment={appointment} />
        ))}
        <section className="flex flex-col gap-3.5">
          <p className="text-xs md:text-sm text-neutral-500">
            {canceled.length} Cancelados
          </p>
          {canceled.map((appointment) => (
            <div className="border-red-900/30 opacity-60" key={appointment.id}>
              <AppointmentsCard appointment={appointment} />
            </div>
          ))}
        </section>
      </section>
    </div>
  );
}
