import { ClosedDaysModalProps } from "@/types/types";
import { useEffect, useState } from "react";
import {
  BiCalendar,
  BiCheckCircle,
  BiPlus,
  BiTrash,
  BiX,
} from "react-icons/bi";
import { FiAlertCircle, FiWifiOff } from "react-icons/fi";
import { checkWhatsAppStatusAction } from "@/app/(dashboard)/actions";

export default function ClosedDaysModal({
  isOpen,
  onClose,
  closedDays,
  onSave,
}: ClosedDaysModalProps) {
  const [localClosedDays, setLocalClosedDays] =
    useState<{ date: string; reason: string }[]>(closedDays);
  const [selectedDate, setSelectedDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const [isWhatsAppConnected, setIsWhatsAppConnected] = useState<
    boolean | null
  >(null);

  useEffect(() => {
    async function checkStatus() {
      if (!isOpen) return;
      try {
        const res = await checkWhatsAppStatusAction();
        setIsWhatsAppConnected(res.connected);
      } catch (err) {
        console.error("Erro ao verificar status do WhatsApp:", err);
        setIsWhatsAppConnected(false);
      }
    }
    checkStatus();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setLocalClosedDays(closedDays);
    }
  }, [isOpen, closedDays]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
      setShowSuccess(false);
      setIsSaving(false);
      setError("");
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const handleAddClosedDay = () => {
    if (!selectedDate) return;

    if (!localClosedDays.some((d) => d.date === selectedDate)) {
      const newItem = {
        date: selectedDate,
        reason: reason.trim() || "Não informado",
      };

      const updatedList = [...localClosedDays, newItem].sort((a, b) =>
        a.date.localeCompare(b.date),
      );

      setLocalClosedDays(updatedList);
    }

    setSelectedDate("");
    setReason("");
  };

  const handleRemoveDraftDay = (dateToRemove: string) => {
    setLocalClosedDays((prev) => prev.filter((d) => d.date !== dateToRemove));
  };

  const isDraftDay = (dateStr: string) => {
    return !closedDays.some((d) => d.date === dateStr);
  };

  const handleSave = async () => {
    if (!isWhatsAppConnected) {
      setError("WhatsApp desconectado. Não é possível salvar dias fechados.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      await onSave(localClosedDays);
      setShowSuccess(true);
      setTimeout(() => {
        onClose();
        setShowSuccess(false);
      }, 1500);
    } catch (err) {
      console.error("Erro ao salvar dias fechados:", err);
      setError("Ocorreu um erro ao salvar as alterações.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setLocalClosedDays(closedDays);
    setSelectedDate("");
    setReason("");
    setError("");
    onClose();
  };

  const formatDateBR = (dateString: string) => {
    const [year, month, day] = dateString.split("-");
    return `${day}/${month}/${year}`;
  };

  const getDayOfWeek = (dateString: string) => {
    const date = new Date(dateString + "T00:00:00");
    const days = [
      "Domingo",
      "Segunda",
      "Terça",
      "Quarta",
      "Quinta",
      "Sexta",
      "Sábado",
    ];
    return days[date.getDay()];
  };

  const today = new Date().toISOString().split("T")[0];
  const futureClosedDays = localClosedDays.filter((d) => d.date >= today);
  const pastClosedDays = localClosedDays.filter((d) => d.date < today);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={handleCancel}
    >
      <div
        className="bg-neutral-900 rounded-xl border border-neutral-800 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col relative"
        onClick={(e) => e.stopPropagation()}
      >
        {showSuccess && (
          <div className="absolute inset-0 bg-neutral-900/90 z-20 flex flex-col items-center justify-center animate-in fade-in duration-300">
            <BiCheckCircle className="w-16 h-16 text-amber-500 animate-bounce" />
            <h3 className="text-xl font-bold text-neutral-50 mt-4">
              Alterações Salvas!
            </h3>
            <p className="text-neutral-400">O calendário foi atualizado.</p>
          </div>
        )}
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="bg-amber-600/10 p-2 rounded-lg">
              <BiCalendar className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3 className="text-neutral-50 text-lg md:text-xl font-semibold">
                Dias de Fechamento
              </h3>
              <p className="text-neutral-400 text-sm">
                Gerencie os dias que a barbearia não funcionará
              </p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="p-2 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
          >
            <BiX className="w-5 h-5 text-neutral-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {/* Status WhatsApp Desconectado */}
          {isWhatsAppConnected === false && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-3 text-xs md:text-sm">
              <FiWifiOff className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="text-red-300">
                <span className="font-semibold block text-red-400">
                  WhatsApp Desconectado
                </span>
                Reconecte a IA para permitir o bloqueio de dias e o envio de
                avisos aos clientes afetados.
              </div>
            </div>
          )}

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
            <FiAlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs md:text-sm text-amber-200/90 leading-relaxed">
              <strong className="text-amber-400 font-semibold">Atenção:</strong>{" "}
              Ao salvar, qualquer agendamento existente nos novos dias
              selecionados será{" "}
              <strong className="text-amber-400 font-semibold">
                cancelado automaticamente
              </strong>{" "}
              e um aviso via WhatsApp será enviado ao cliente. Esta ação não
              poderá ser desfeita.
            </p>
          </div>

          <div className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-5">
            <h4 className="text-neutral-50 mb-4 flex items-center gap-2">
              <BiPlus className="w-5 h-5" />
              <span>Adicionar Dia de Fechamento</span>
            </h4>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="closed-date"
                  className="block text-neutral-400 text-sm mb-2"
                >
                  Selecione a Data
                </label>
                <input
                  id="closed-date"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  min={today}
                  className="w-full bg-neutral-900 border border-neutral-700 text-neutral-100 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                />
              </div>

              <div>
                <label
                  htmlFor="closed-reason"
                  className="block text-neutral-400 text-sm mb-2"
                >
                  Motivo (opcional)
                </label>
                <input
                  id="closed-reason"
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={50}
                  placeholder="Ex: Feriado, Manutenção..."
                  className="w-full bg-neutral-900 border border-neutral-700 text-neutral-100 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent placeholder:text-neutral-500"
                />
              </div>

              <button
                onClick={handleAddClosedDay}
                disabled={!selectedDate}
                className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-neutral-700 disabled:cursor-not-allowed text-neutral-950 disabled:text-neutral-500 font-medium rounded-lg px-4 py-3 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <BiPlus className="w-5 h-5" />
                <span>Adicionar</span>
              </button>
            </div>
          </div>

          {futureClosedDays.length > 0 && (
            <div>
              <h4 className="text-neutral-50 mb-3 flex items-center gap-2">
                <FiAlertCircle className="w-5 h-5 text-amber-500" />
                <span>Próximos Fechamentos ({futureClosedDays.length})</span>
              </h4>

              <div className="space-y-2">
                {futureClosedDays.map((item) => {
                  const isDraft = isDraftDay(item.date);
                  const isToday = item.date === today;

                  return (
                    <div
                      key={item.date}
                      className="group bg-neutral-800/40 border border-neutral-700/50 rounded-xl p-4 flex items-center gap-4 hover:border-amber-500/50 hover:bg-neutral-800 transition-all duration-300"
                    >
                      <div className="flex flex-col items-center justify-center min-w-[65px] h-[65px] bg-neutral-900 border border-neutral-700 rounded-lg group-hover:border-amber-500/30 transition-colors">
                        <span className="text-[10px] uppercase tracking-widest text-amber-500 font-bold">
                          {isToday
                            ? "HOJE"
                            : getDayOfWeek(item.date).substring(0, 3)}
                        </span>
                        <span className="text-xl font-bold text-neutral-50 leading-none">
                          {item.date.split("-")[2]}
                        </span>
                        <span className="text-[10px] text-neutral-400">
                          {new Intl.DateTimeFormat("pt-BR", { month: "short" })
                            .format(new Date(item.date + "T00:00:00"))
                            .replace(".", "")}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-neutral-200 font-medium truncate">
                            {formatDateBR(item.date)}
                          </span>
                          {isToday ? (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-red-500/20 text-red-400 uppercase font-bold">
                              Hoje
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-neutral-700 text-neutral-400 uppercase font-semibold">
                              {getDayOfWeek(item.date)}
                            </span>
                          )}
                          {isDraft && (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-400 font-medium">
                              Novo (Não salvo)
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 mt-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-500/50" />
                          <p className="text-neutral-400 text-sm italic truncate">
                            {item.reason || "Sem motivo informado"}
                          </p>
                        </div>
                      </div>

                      {isDraft && (
                        <button
                          type="button"
                          onClick={() => handleRemoveDraftDay(item.date)}
                          className="p-2 text-neutral-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Remover este dia antes de salvar"
                        >
                          <BiTrash className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {pastClosedDays.length > 0 && (
            <div>
              <h4 className="text-neutral-400 text-sm mb-3">
                Fechamentos Anteriores ({pastClosedDays.length})
              </h4>

              <div className="space-y-2">
                {pastClosedDays.map((item) => {
                  const isToday = item.date === today;
                  return (
                    <div
                      key={item.date}
                      className="bg-neutral-800/30 border border-neutral-800 rounded-lg p-3 flex items-center justify-between opacity-60"
                    >
                      <div>
                        <div className="text-neutral-400 text-sm flex items-center gap-2">
                          {formatDateBR(item.date)}
                          {isToday && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-red-500/20 text-red-400 uppercase font-bold">
                              Hoje
                            </span>
                          )}
                        </div>
                        <div className="text-neutral-500 text-xs mt-0.5">
                          {isToday ? "Hoje" : getDayOfWeek(item.date)}
                        </div>
                      </div>
                      <div className="text-neutral-500 text-xs italic truncate max-w-[200px]">
                        {item.reason}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {localClosedDays.length === 0 && (
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center bg-neutral-800/50 p-2 rounded-full mb-4">
                <BiCalendar className="w-8 h-8 text-neutral-600" />
              </div>
              <p className="text-neutral-400">
                Nenhum dia de fechamento cadastrado
              </p>
              <p className="text-neutral-500 text-sm mt-1">
                Adicione os dias que a barbearia não funcionará.
              </p>
            </div>
          )}

          {error && (
            <p className="text-red-400 text-xs font-medium text-center">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 p-4 md:p-6 border-t border-neutral-800 bg-neutral-900/50">
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="flex-1 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={
              isSaving ||
              isWhatsAppConnected === false ||
              isWhatsAppConnected === null
            }
            className="flex-1 px-4 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-neutral-800 text-neutral-950 disabled:text-neutral-500 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          >
            {isWhatsAppConnected === null ? (
              <div className="w-5 h-5 border-2 border-neutral-500/30 border-t-neutral-500 rounded-full animate-spin" />
            ) : isSaving ? (
              <div className="w-5 h-5 border-2 border-neutral-950/30 border-t-neutral-950 rounded-full animate-spin" />
            ) : (
              "Salvar Alterações"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
