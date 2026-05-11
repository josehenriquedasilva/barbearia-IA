import { ClosedDaysModalProps } from "@/types/types";
import { useEffect, useState } from "react";
import { BiCalendar, BiCheckCircle, BiPlus, BiX } from "react-icons/bi";
import { BsTrash2 } from "react-icons/bs";
import { FiAlertCircle } from "react-icons/fi";

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

  const handleRemoveClosedDay = (date: string) => {
    setLocalClosedDays(localClosedDays.filter((d) => d.date !== date));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(localClosedDays);
      setShowSuccess(true);
      setTimeout(() => {
        onClose();
        setShowSuccess(false);
      }, 1500);
    } catch (error) {
      console.error("Erro ao salvar dias fechados:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setLocalClosedDays(closedDays);
    setSelectedDate("");
    setReason("");
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
        className="bg-neutral-900 rounded-xl border border-neutral-800 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
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
              <h3 className="text-neutral-50 text-lg md:text-xl">
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
                  placeholder="Ex: Feriado, Manutenção..."
                  className="w-full bg-neutral-900 border border-neutral-700 text-neutral-100 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent placeholder:text-neutral-500"
                />
              </div>

              <button
                onClick={handleAddClosedDay}
                disabled={!selectedDate}
                className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-neutral-700 disabled:cursor-not-allowed text-neutral-950 disabled:text-neutral-500 rounded-lg px-4 py-3 transition-colors flex items-center justify-center gap-2"
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
                {futureClosedDays.map((date) => (
                  <div
                    key={date.date}
                    className="bg-neutral-800 border border-neutral-700 rounded-lg p-4 flex items-center justify-between hover:border-amber-600/30 transition-colors"
                  >
                    <div>
                      <div className="text-neutral-50 font-medium">
                        {formatDateBR(date.date)}
                      </div>
                      <div className="text-neutral-400 text-sm mt-1">
                        {getDayOfWeek(date.date)}
                      </div>
                      <div className="text-neutral-400 text-sm mt-1">
                        {date.reason}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveClosedDay(date.date)}
                      className="p-2 hover:bg-neutral-700 rounded-lg transition-colors cursor-pointer"
                      title="Remover"
                    >
                      <BsTrash2 className="w-5 h-5 text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pastClosedDays.length > 0 && (
            <div>
              <h4 className="text-neutral-400 text-sm mb-3">
                Fechamentos Anteriores ({pastClosedDays.length})
              </h4>

              <div className="space-y-2">
                {pastClosedDays.map((date) => (
                  <div
                    key={date.date}
                    className="bg-neutral-800/30 border border-neutral-800 rounded-lg p-3 flex items-center justify-between opacity-60"
                  >
                    <div>
                      <div className="text-neutral-400 text-sm">
                        {formatDateBR(date.date)}
                      </div>
                      <div className="text-neutral-500 text-xs mt-0.5">
                        {getDayOfWeek(date.date)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {localClosedDays.length === 0 && (
            <div className="text-center">
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
        </div>

        <div className="flex items-center gap-3 p-4 md:p-6 border-t border-neutral-800">
          <button
            onClick={handleCancel}
            className="flex-1 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 px-4 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-800 text-neutral-950 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSaving ? (
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
