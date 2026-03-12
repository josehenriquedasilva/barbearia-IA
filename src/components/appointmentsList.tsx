import { AppointmentsListProps } from "@/types/types";
import AppointmentsCard from "./ui/appointmentsCard";

export default function Appointments({
  appointments,
  onOpenCancelModal,
}: AppointmentsListProps) {
  const list = appointments || [];
  const confirmed = list.filter((a) => a.status !== "CANCELED");
  const canceled = list.filter((a) => a.status === "CANCELED");

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 md:p-6">
      <section className="flex justify-between items-center mb-5">
        <h1 className="text-neutral-50 text-lg md:text-xl">
          Agendamentos do Dia
        </h1>
        <p className="text-xs md:text-sm text-neutral-400">
          {list.length} {list.length === 1 ? "Agendamento" : "Agendamentos"}
        </p>
      </section>

      {confirmed.length === 0 && canceled.length === 0 ? (
        <div className="text-center py-8 md:py-12">
          <p className="text-neutral-500 text-sm md:text-base">
            Nenhum agendamento para hoje
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] md:max-h-[600px] overflow-y-scroll pr-1 md:pr-2 custom-scrollbar">
          {confirmed.map((appointment) => (
            <AppointmentsCard
              key={appointment.id}
              appointment={appointment}
              onOpenCancelModal={onOpenCancelModal}
            />
          ))}

          {canceled.length > 0 && (
            <>
              <div className="pt-4 pb-2">
                <p className="text-xs md:text-sm text-neutral-500">
                  {canceled.length}{" "}
                  {canceled.length === 1 ? "Cancelado" : "Cancelados"}
                </p>
              </div>
              {canceled.map((appointment) => (
                <div
                  key={appointment.id}
                  className="border-red-900/30 opacity-60"
                >
                  <AppointmentsCard
                    appointment={appointment}
                    onOpenCancelModal={() => {}}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
