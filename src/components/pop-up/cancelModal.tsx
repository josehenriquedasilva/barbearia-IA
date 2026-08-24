import {
  cancelAppointmentAction,
  checkWhatsAppStatusAction,
} from "@/app/(dashboard)/actions";
import { AppointmentData } from "@/types/types";
import { useEffect, useState } from "react";
import { BiCheckCircle, BiPhone, BiUser, BiX } from "react-icons/bi";
import { BsClock, BsScissors } from "react-icons/bs";
import { FiAlertCircle, FiWifiOff } from "react-icons/fi";

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

  const [isWhatsAppConnected, setIsWhatsAppConnected] = useState<
    boolean | null
  >(null);

  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await checkWhatsAppStatusAction();
        setIsWhatsAppConnected(res.connected);
      } catch (err) {
        console.error("Erro ao verificar status do WhatsApp:", err);
        setIsWhatsAppConnected(false);
      }
    }
    checkStatus();
  }, []);

  const handleConfirmCancel = async () => {
    if (!isWhatsAppConnected) {
      setError("WhatsApp desconectado. Não é possível cancelar.");
      return;
    }

    if (!reason.trim()) {
      setError("Informe o motivo do cancelamento.");
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
      }
    } catch (err) {
      setError(`Erro de conexão: ${err}`);
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
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
      onClick={modalClose}
    >
      <div
        className="bg-neutral-900 rounded-2xl border border-neutral-800 w-full max-w-sm sm:max-w-md overflow-hidden shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tela de Sucesso */}
        {showSuccess && (
          <div className="absolute inset-0 bg-neutral-900/98 z-20 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
            <div className="bg-red-500/10 p-3.5 rounded-full mb-3">
              <BiCheckCircle className="w-12 h-12 text-red-500 animate-bounce" />
            </div>
            <h3 className="text-lg font-bold text-neutral-50">
              Agendamento Cancelado
            </h3>
            <p className="text-neutral-400 text-xs mt-1">
              Horário liberado e cliente notificado no WhatsApp.
            </p>
          </div>
        )}

        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="bg-red-500/10 p-1.5 rounded-md">
              <FiAlertCircle className="w-4 h-4 text-red-500" />
            </div>
            <h3 className="text-neutral-100 font-semibold text-base">
              Cancelar Agendamento
            </h3>
          </div>
          {!showSuccess && (
            <button
              onClick={modalClose}
              className="p-1 hover:bg-neutral-800 rounded-lg text-neutral-400 transition-colors"
            >
              <BiX className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Corpo do Modal */}
        <div className="p-4 space-y-3.5">
          {/* Status WhatsApp Desconectado */}
          {isWhatsAppConnected === false && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 flex items-start gap-2.5 text-xs">
              <FiWifiOff className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div className="text-red-300">
                <span className="font-semibold block text-red-400">
                  WhatsApp Desconectado
                </span>
                Reconecte a IA para permitir o cancelamento e envio de aviso ao
                cliente.
              </div>
            </div>
          )}

          {/* Card Resumido do Agendamento */}
          <div className="bg-neutral-800/60 border border-neutral-800 rounded-xl p-3 space-y-2 text-xs sm:text-sm">
            {/* Linha 1: Cliente e Telefone */}
            <div className="flex items-center justify-between gap-2 border-b border-neutral-700/50 pb-2">
              <div className="flex items-center gap-1.5 text-neutral-100 font-medium truncate">
                <BiUser className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="truncate">{appointment.clientName}</span>
              </div>
              <div className="flex items-center gap-1 text-neutral-400 shrink-0">
                <BiPhone className="w-3.5 h-3.5" />
                <span>{formattedNumber(appointment.clientPhone)}</span>
              </div>
            </div>

            {/* Linha 2: Serviço, Horário e Valor */}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <div className="flex items-center gap-1.5 text-neutral-300 truncate">
                <BsScissors className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="truncate">{appointment.service.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-neutral-400 flex items-center gap-1">
                  <BsClock className="w-3 h-3 text-neutral-500" />
                  {formattedTime} ({appointment.service.durationMinutes}m)
                </span>
                <span className="font-semibold text-amber-500">
                  R${" "}
                  {Number(appointment.service.price || 0)
                    .toFixed(2)
                    .replace(".", ",")}
                </span>
              </div>
            </div>
          </div>

          {/* Campo de Motivo */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label
                htmlFor="cancel-reason"
                className="text-neutral-300 font-medium"
              >
                Motivo do cancelamento <span className="text-red-400">*</span>
              </label>
              <span className="text-neutral-500">Aviso via WhatsApp</span>
            </div>
            <textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError("");
              }}
              disabled={
                isLoading ||
                showSuccess ||
                isWhatsAppConnected === false ||
                isWhatsAppConnected === null
              }
              placeholder={
                isWhatsAppConnected === false
                  ? "Reconecte o WhatsApp para habilitar..."
                  : "Ex: Imprevisto de horário, cliente reagendou..."
              }
              className="w-full bg-neutral-800/80 border border-neutral-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 resize-none disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              rows={2.5}
            />
            {error && (
              <p className="text-red-400 text-xs font-medium">{error}</p>
            )}
          </div>
        </div>

        {/* Rodapé / Ações */}
        <div className="flex items-center gap-2 p-3 sm:p-4 border-t border-neutral-800 bg-neutral-900/50">
          <button
            onClick={modalClose}
            disabled={isLoading || showSuccess}
            className="flex-1 px-3 py-2.5 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-800 text-neutral-300 text-xs sm:text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            Voltar
          </button>
          <button
            onClick={handleConfirmCancel}
            disabled={
              isLoading ||
              showSuccess ||
              isWhatsAppConnected === false ||
              isWhatsAppConnected === null
            }
            className="flex-1 px-3 py-2.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs sm:text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-h-[40px]"
          >
            {isWhatsAppConnected === null ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : isLoading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              "Confirmar"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
