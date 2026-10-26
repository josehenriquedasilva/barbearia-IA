import { ClosedDaysModalProps } from "@/types/types";
import { useEffect, useState } from "react";
import {
  BiCalendar,
  BiCheckCircle,
  BiPlus,
  BiTrash,
  BiX,
  BiLockAlt,
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
      setIsWhatsAppConnected(null);
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

    if (!isWhatsAppConnected) {
      setError(
        "WhatsApp desconectado. Conecte o WhatsApp para adicionar dias fechados.",
      );
      return;
    }

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
    setError("");
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
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-3 sm:p-4"
      onClick={handleCancel}
    >
      <div
        className="bg-neutral-900 rounded-2xl border border-neutral-800 w-full max-w-xl h-[90vh] max-h-[680px] flex flex-col relative shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {showSuccess && (
          <div className="absolute inset-0 bg-neutral-900/95 z-30 flex flex-col items-center justify-center animate-in fade-in duration-300">
            <BiCheckCircle className="w-16 h-16 text-amber-500 animate-bounce" />
            <h3 className="text-xl font-bold text-neutral-50 mt-4">
              Alterações Salvas!
            </h3>
            <p className="text-neutral-400">O calendário foi atualizado.</p>
          </div>
        )}

        {/* CABEÇALHO */}
        <div className="flex items-center justify-between px-4 py-3.5 sm:px-6 sm:py-4 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-amber-600/10 p-2 rounded-xl">
              <BiCalendar className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3 className="text-neutral-50 text-base sm:text-lg font-semibold">
                Dias de Fechamento
              </h3>
              <p className="text-neutral-400 text-xs sm:text-sm">
                Gerencie os dias sem expediente
              </p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="p-2 hover:bg-neutral-800 rounded-xl transition-colors cursor-pointer text-neutral-400 hover:text-neutral-200"
          >
            <BiX className="w-5 h-5" />
          </button>
        </div>

        {/* CONTEÚDO COM ROLAGEM CORRIGIDA */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 space-y-4">
          {/* AVISO WHATSAPP DESCONECTADO */}
          {isWhatsAppConnected === false && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-3 text-xs sm:text-sm">
              <div className="bg-red-500/20 p-2 rounded-lg text-red-400 shrink-0">
                <FiWifiOff className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-semibold block text-red-400">
                  WhatsApp Desconectado
                </span>
                <p className="text-red-300/90 text-[11px] sm:text-xs mt-0.5 leading-snug">
                  Reconecte no painel principal para habilitar o bloqueio e
                  avisos.
                </p>
              </div>
            </div>
          )}

          {/* AVISO RESUMIDO E DIRETO */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 sm:p-3.5 flex items-start gap-2.5">
            <FiAlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200/90 leading-relaxed">
              <strong className="text-amber-400 font-semibold">Atenção:</strong>{" "}
              Novos dias fechados cancelarão agendamentos e avisarão clientes
              via WhatsApp.
            </p>
          </div>

          {/* FORMULÁRIO DE ADIÇÃO CLEAN */}
          <div
            className={`bg-neutral-800/40 border border-neutral-700/60 rounded-xl p-4 sm:p-4.5 space-y-3.5 transition-opacity ${
              isWhatsAppConnected === false
                ? "opacity-50 pointer-events-none"
                : ""
            }`}
          >
            <h4 className="text-neutral-200 text-xs sm:text-sm font-semibold flex items-center gap-2">
              <BiPlus className="w-4 h-4 text-amber-500" />
              <span>Adicionar Data de Fechamento</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="closed-date"
                  className="block text-neutral-400 text-xs mb-1.5 font-medium"
                >
                  Data
                </label>
                <input
                  id="closed-date"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  min={today}
                  disabled={isWhatsAppConnected === false}
                  className="w-full bg-neutral-900 border border-neutral-700 text-neutral-100 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:cursor-pointer disabled:opacity-50"
                />
              </div>

              <div>
                <label
                  htmlFor="closed-reason"
                  className="block text-neutral-400 text-xs mb-1.5 font-medium"
                >
                  Motivo <span className="text-neutral-500">(Opcional)</span>
                </label>
                <input
                  id="closed-reason"
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={50}
                  disabled={isWhatsAppConnected === false}
                  placeholder="Ex: Feriado, Manutenção"
                  className="w-full bg-neutral-900 border border-neutral-700 text-neutral-100 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent placeholder:text-neutral-500 disabled:opacity-50"
                />
              </div>
            </div>

            <button
              onClick={handleAddClosedDay}
              disabled={!selectedDate || isWhatsAppConnected === false}
              className="w-full bg-amber-600 hover:bg-amber-500 active:scale-[0.98] disabled:bg-neutral-800 disabled:cursor-not-allowed text-neutral-950 disabled:text-neutral-500 font-bold rounded-xl px-4 py-2.5 text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              <BiPlus className="w-4 h-4" />
              <span>Adicionar à Lista</span>
            </button>
          </div>

          {/* LISTA DE PRÓXIMOS FECHAMENTOS */}
          {futureClosedDays.length > 0 && (
            <div className="space-y-2.5">
              <h4 className="text-neutral-300 text-xs sm:text-sm font-semibold flex items-center gap-2">
                <span>Próximos Fechamentos ({futureClosedDays.length})</span>
              </h4>

              <div className="space-y-2">
                {futureClosedDays.map((item) => {
                  const isDraft = isDraftDay(item.date);
                  const isToday = item.date === today;

                  return (
                    <div
                      key={item.date}
                      className="group bg-neutral-800/40 border border-neutral-700/50 rounded-xl p-3 sm:p-3.5 flex items-center gap-3 hover:border-amber-500/50 hover:bg-neutral-800/60 transition-all"
                    >
                      <div className="flex flex-col items-center justify-center min-w-[54px] h-[54px] bg-neutral-900 border border-neutral-700/80 rounded-xl shrink-0">
                        <span className="text-[9px] uppercase tracking-widest text-amber-500 font-bold">
                          {isToday
                            ? "HOJE"
                            : getDayOfWeek(item.date).substring(0, 3)}
                        </span>
                        <span className="text-lg font-extrabold text-neutral-50 leading-none mt-0.5">
                          {item.date.split("-")[2]}
                        </span>
                        <span className="text-[9px] text-neutral-400">
                          {new Intl.DateTimeFormat("pt-BR", { month: "short" })
                            .format(new Date(item.date + "T00:00:00"))
                            .replace(".", "")}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-neutral-200 text-xs sm:text-sm font-semibold truncate">
                            {formatDateBR(item.date)}
                          </span>
                          {isToday ? (
                            <span className="px-2 py-0.5 rounded text-[9px] bg-red-500/20 text-red-400 uppercase font-bold">
                              Hoje
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[9px] bg-neutral-800 text-neutral-400 uppercase font-medium border border-neutral-700">
                              {getDayOfWeek(item.date)}
                            </span>
                          )}
                          {isDraft && (
                            <span className="px-2 py-0.5 rounded text-[9px] bg-amber-500/20 text-amber-400 font-medium border border-amber-500/30">
                              Novo
                            </span>
                          )}
                        </div>
                        <p className="text-neutral-400 text-xs italic truncate mt-1">
                          {item.reason || "Sem motivo informado"}
                        </p>
                      </div>

                      {isDraft && (
                        <button
                          type="button"
                          onClick={() => handleRemoveDraftDay(item.date)}
                          className="p-2 text-neutral-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer shrink-0"
                          title="Remover"
                        >
                          <BiTrash className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* FECHAMENTOS ANTERIORES */}
          {pastClosedDays.length > 0 && (
            <div className="space-y-2 pt-2">
              <h4 className="text-neutral-500 text-xs font-medium">
                Anteriores ({pastClosedDays.length})
              </h4>
              <div className="space-y-1.5 opacity-60">
                {pastClosedDays.map((item) => (
                  <div
                    key={item.date}
                    className="bg-neutral-800/20 border border-neutral-800/80 rounded-xl px-3 py-2 flex items-center justify-between text-xs"
                  >
                    <span className="text-neutral-400 font-medium">
                      {formatDateBR(item.date)}
                    </span>
                    <span className="text-neutral-500 italic truncate max-w-[180px]">
                      {item.reason}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {localClosedDays.length === 0 && (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center bg-neutral-800/40 p-3 rounded-2xl mb-2 text-neutral-600">
                <BiCalendar className="w-6 h-6" />
              </div>
              <p className="text-neutral-400 text-xs sm:text-sm">
                Nenhum dia fechado cadastrado
              </p>
            </div>
          )}

          {error && (
            <p className="text-red-400 text-xs font-medium text-center bg-red-500/10 border border-red-500/20 p-2.5 rounded-xl">
              {error}
            </p>
          )}
        </div>

        {/* RODAPÉ COM BOTÕES OTIMIZADOS MOBILE */}
        <div className="flex items-center gap-3 px-4 py-3.5 sm:px-6 sm:py-4 border-t border-neutral-800 bg-neutral-900/90 shrink-0">
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="flex-1 px-4 py-2.5 sm:py-3 bg-neutral-800 hover:bg-neutral-700 active:scale-[0.98] text-neutral-300 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer disabled:opacity-50"
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
            className="flex-1 px-4 py-2.5 sm:py-3 bg-amber-600 hover:bg-amber-500 active:scale-[0.98] disabled:bg-neutral-800 text-neutral-950 disabled:text-neutral-400 font-bold rounded-xl text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed shadow-md"
          >
            {isWhatsAppConnected === null ? (
              <>
                <div className="w-4 h-4 border-2 border-neutral-400/30 border-t-neutral-400 rounded-full animate-spin" />
                <span>Verificando...</span>
              </>
            ) : isWhatsAppConnected === false ? (
              <>
                <BiLockAlt className="w-4 h-4 text-neutral-400" />
                <span>Desconectado</span>
              </>
            ) : isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-neutral-950/30 border-t-neutral-950 rounded-full animate-spin" />
                <span>Salvando...</span>
              </>
            ) : (
              "Salvar Alterações"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
