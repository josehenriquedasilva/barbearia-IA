import { cancelAppointmentAction } from "@/app/(dashboard)/actions";
import { AppointmentData } from "@/types/types";
import { useState } from "react";
import { BiCheckCircle, BiPhone, BiUser, BiX } from "react-icons/bi";
import { BsClock, BsScissors } from "react-icons/bs";
import { FiAlertCircle } from "react-icons/fi";

interface ManageCancelModal {
  appointment: AppointmentData;
  modalClose: () => void;
  mutate: () => void;
}

export default function CancelModal({
  appointment,
  modalClose,
  mutate,
}: ManageCancelModal) {
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [reason, setReason] = useState("");

  const handleConfirmCancel = async () => {
    if (!reason.trim()) {
      setError("Por favor, informe o motivo do cancelamento.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const result = await cancelAppointmentAction(
        appointment.id,
        reason.trim(),
      );

      if (result.success) {
        await mutate();
        setShowSuccess(true);
        setTimeout(() => modalClose(), 1500);
      } else {
        setError(result.error || "Ocorreu um erro ao cancelar.");
        setIsLoading(false);
      }
    } catch (err) {
      setError(`Erro de conexão com o servidor: ${err}}`);
    } finally {
      setIsLoading(false);
    }
  };

  const formattedNumber = (phone: string) => {
    const digits = phone.replace(/\D/g, "");

    const cleanDigits =
      digits.startsWith("55") && digits.length >= 10
        ? digits.substring(2)
        : digits;

    return cleanDigits.replace(/(\d{2})(\d{1})(\d{4})(\d{4})/, "($1) $2 $3-$4");
  };

  const formattedTime = new Date(appointment.startTime).toLocaleTimeString(
    "pt-BR",
    {
      hour: "2-digit",
      minute: "2-digit",
    },
  );

  return (
    <>
      <div
        className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
        onClick={modalClose}
      >
        <div
          className="bg-neutral-900 rounded-xl border border-neutral-800 w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          {showSuccess && (
            <div className="absolute inset-0 bg-neutral-900/95 z-20 flex flex-col items-center justify-center animate-in fade-in duration-300">
              <div className="bg-red-500/10 p-4 rounded-full mb-4">
                <BiCheckCircle className="w-16 h-16 text-red-500 animate-bounce" />
              </div>
              <h3 className="text-xl font-bold text-neutral-50 mt-2">
                Agendamento Cancelado
              </h3>
              <p className="text-neutral-400 text-center px-6 mt-1">
                O horário foi liberado e o cliente será notificado.
              </p>
            </div>
          )}
          <div className="flex items-center justify-between p-4 md:p-6 border-b border-neutral-800">
            <div className="flex items-center gap-3">
              <div className="bg-red-600/10 p-2 rounded-lg">
                <FiAlertCircle className="w-5 h-5 text-red-500" />
              </div>
              <h3 className="text-neutral-50 text-lg md:text-xl">
                Cancelar Agendamento
              </h3>
            </div>
            {!showSuccess && (
              <button
                onClick={modalClose}
                className="p-2 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
              >
                <BiX className="w-5 h-5 text-neutral-400" />
              </button>
            )}
          </div>

          <div className="p-4 md:p-6 space-y-4">
            <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4 space-y-3">
              <p className="text-neutral-400 text-xs uppercase tracking-wide">
                Dados do Agendamento
              </p>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-neutral-100">
                  <BiUser className="w-4 h-4 text-amber-500" />
                  <span className="text-sm">{appointment.clientName}</span>
                </div>

                <div className="flex items-center gap-2 text-neutral-100">
                  <BiPhone className="w-4 h-4 text-amber-500" />
                  <span className="text-sm">
                    {formattedNumber(appointment.clientPhone)}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-neutral-100">
                  <BsScissors className="w-4 h-4 text-amber-500" />
                  <span className="text-sm">{appointment.service.name}</span>
                </div>

                <div className="flex items-center gap-2 text-neutral-100">
                  <BsClock className="w-4 h-4 text-amber-500" />
                  <span className="text-sm">
                    {formattedTime} • {appointment.service.durationMinutes} min
                  </span>
                </div>

                <div className="pt-2 border-t border-neutral-700">
                  <span className="text-amber-500 font-medium">
                    R${" "}
                    {Number(appointment.service.price || 0)
                      .toFixed(2)
                      .replace(".", ",")}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-neutral-300 text-sm md:text-base">
              Informe o motivo do cancelamento. O cliente será notificado
              automaticamente.
            </p>

            <div>
              <form action="">
                <label
                  htmlFor="cancel-reason"
                  className="block text-neutral-400 text-sm mb-2"
                >
                  Motivo do cancelamento *
                </label>
                <textarea
                  id="cancel-reason"
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (error) setError("");
                  }}
                  disabled={isLoading || showSuccess}
                  placeholder="Ex: Cliente não compareceu, reagendado, emergência pessoal..."
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent resize-none"
                  rows={4}
                />
                {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
              </form>
            </div>

            <div className="bg-amber-600/10 border border-amber-600/20 rounded-lg p-3 md:p-4">
              <p className="text-amber-500 text-xs md:text-sm">
                ⚠️ Esta ação não pode ser desfeita. O cliente receberá uma
                notificação por WhatsApp informando o cancelamento e o motivo.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 md:p-6 border-t border-neutral-800">
            <button
              onClick={modalClose}
              disabled={isLoading || showSuccess}
              className="flex-2 px-4 py-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition-colors"
            >
              Voltar
            </button>
            <button
              onClick={handleConfirmCancel}
              disabled={isLoading || showSuccess}
              className="flex-2 px-4 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors cursor-pointer"
            >
              {isLoading ? (
                <div className="inline-block m-2.5 w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                "Confirmar Cancelamento"
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
