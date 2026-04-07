import { Service, SettingsModalProps } from "@/types/types";
import { useEffect, useState } from "react";
import { BiCheckCircle, BiCoffeeTogo, BiPlus, BiX } from "react-icons/bi";
import { BsClock, BsScissors, BsTrash2 } from "react-icons/bs";
import { CiSettings } from "react-icons/ci";
import { FaDollarSign } from "react-icons/fa";
import { FiEdit2 } from "react-icons/fi";

export default function SettingsModal({
  isOpen,
  onClose,
  shop,
  services,
  onSave,
}: SettingsModalProps) {
  const [localServices, setLocalServices] = useState<Service[]>(services || []);

  const [openingTime, setOpeningTime] = useState(shop?.openingTime || "09:00");
  const [closingTime, setClosingTime] = useState(shop?.closingTime || "19:00");

  const [isClosedSunday, setIsClosedSunday] = useState(
    shop?.isClosedSunday ?? true,
  );
  const [openingSunday, setOpeningSunday] = useState(
    shop?.openingSunday || "09:00",
  );
  const [closingSunday, setClosingSunday] = useState(
    shop?.closingSunday || "13:00",
  );

  const [hasDayOff, setHasDayOff] = useState(shop?.hasDayOff ?? false);
  const [dayOff, setDayOff] = useState(shop?.dayOff || "Segunda-feira");

  const [hasLunchBreak, setHasLunchBreak] = useState(
    shop?.hasLunchBreak ?? false,
  );
  const [lunchStart, setLunchStart] = useState(shop?.lunchStart || "12:00");
  const [lunchEnd, setLunchEnd] = useState(shop?.lunchEnd || "13:00");

  // Estados de controle de UI
  const [isAddingService, setIsAddingService] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [deletingServiceId, setDeletingServiceId] = useState<number | null>(
    null,
  );

  const weekDays = [
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
    "Domingo",
  ];

  const [formData, setFormData] = useState({
    name: "",
    price: "",
    duration: "",
  });
  const [errors, setErrors] = useState({ name: "", price: "", duration: "" });
  const resetForm = () => {
    setFormData({
      name: "",
      price: "",
      duration: "",
    });
    setErrors({
      name: "",
      price: "",
      duration: "",
    });
  };

  const validateForm = () => {
    const newErrors = {
      name: "",
      price: "",
      duration: "",
    };

    if (!formData.name.trim()) {
      newErrors.name = "Nome do serviço é obrigatório";
    }

    if (!formData.price || parseFloat(formData.price) <= 0) {
      newErrors.price = "Preço deve ser maior que zero";
    }

    if (!formData.duration || parseInt(formData.duration) <= 0) {
      newErrors.duration = "Duração deve ser maior que zero";
    }

    setErrors(newErrors);
    return !newErrors.name && !newErrors.price && !newErrors.duration;
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const handleAddOrEditService = () => {
    if (!validateForm()) return;

    const serviceData = {
      id: editingServiceId || Date.now(),
      name: formData.name.trim(),
      price: parseFloat(formData.price),
      duration: parseInt(formData.duration),
    };

    if (editingServiceId) {
      setLocalServices((prev) =>
        prev.map((service) =>
          service.id === editingServiceId ? serviceData : service,
        ),
      );
      setEditingServiceId(null);
    } else {
      setLocalServices((prev) => [...prev, serviceData]);
    }

    setIsAddingService(false);
    resetForm();
  };

  const handleEditService = (service: Service) => {
    setFormData({
      name: service.name,
      price: service.price.toString(),
      duration: service.duration.toString(),
    });
    setEditingServiceId(service.id);
    setIsAddingService(true);
  };

  const handleDeleteService = (serviceId: number) => {
    setDeletingServiceId(serviceId);
  };

  const confirmDelete = () => {
    if (deletingServiceId) {
      setLocalServices((prev) =>
        prev.filter((service) => service.id !== deletingServiceId),
      );
      setDeletingServiceId(null);
    }
  };

  const cancelDelete = () => {
    setDeletingServiceId(null);
  };

  const handleSave = () => {
    if (localServices.length === 0) {
      alert("Cadastre pelo menos um serviço antes de continuar");
      return;
    }

    const payload = {
      services: localServices,
      openingTime,
      closingTime,
      hasDayOff,
      dayOff: hasDayOff ? dayOff : null,
      isClosedSunday,
      openingSunday: isClosedSunday ? null : openingSunday,
      closingSunday: isClosedSunday ? null : closingSunday,
      hasLunchBreak,
      lunchStart: hasLunchBreak ? lunchStart : null,
      lunchEnd: hasLunchBreak ? lunchEnd : null,
    };

    onSave(payload);
    setShowSuccess(true);
    setTimeout(() => {
      onClose();
      setShowSuccess(false);
    }, 1500);
  };

  const handleCancel = () => {
    setIsAddingService(false);
    setEditingServiceId(null);
    resetForm();
    if (!isAddingService && !editingServiceId) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="bg-neutral-900 rounded-xl border border-neutral-800 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {showSuccess && (
            <div className="absolute inset-0 bg-neutral-900/95 z-50 flex flex-col items-center justify-center animate-in fade-in duration-300">
              <BiCheckCircle className="w-16 h-16 text-amber-500 animate-bounce" />
              <h3 className="text-xl font-bold text-neutral-50 mt-4">
                Configurações Atualizadas!
              </h3>
            </div>
          )}

          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-neutral-800">
            <div className="flex items-center gap-3">
              <div className="bg-amber-600/10 p-2 rounded-lg">
                <CiSettings className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <h3 className="text-neutral-50 text-xl font-bold">
                  Configurações
                </h3>
                <p className="text-neutral-400 text-sm">
                  Gerencie serviços e horários de atendimento
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
            >
              <BiX className="w-6 h-6 text-neutral-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
            {/* SEÇÃO 1: SERVIÇOS */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-amber-500 mb-4">
                <BsScissors className="w-5 h-5" />
                <h4 className="font-bold uppercase text-xs tracking-widest">
                  Serviços Oferecidos
                </h4>
              </div>

              {isAddingService ? (
                <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4 md:p-6 mb-6">
                  <h4 className="text-neutral-50 text-lg mb-4">
                    {editingServiceId
                      ? "Editar Serviço"
                      : "Adicionar Novo Serviço"}
                  </h4>

                  <div className="space-y-4">
                    <div>
                      <label
                        htmlFor="service-name"
                        className="block text-neutral-400 text-sm mb-2"
                      >
                        Nome do Serviço *
                      </label>
                      <input
                        id="service-name"
                        type="text"
                        value={formData.name}
                        onChange={(e) => {
                          setFormData({ ...formData, name: e.target.value });
                          setErrors({ ...errors, name: "" });
                        }}
                        placeholder="Ex: Corte Social, Barba Completa..."
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3 text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                      />
                      {errors.name && (
                        <p className="text-red-400 text-sm mt-2">
                          {errors.name}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="service-price"
                          className="block text-neutral-400 text-sm mb-2"
                        >
                          Preço (R$) *
                        </label>
                        <div className="relative">
                          <FaDollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                          <input
                            id="service-price"
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.price}
                            onChange={(e) => {
                              setFormData({
                                ...formData,
                                price: e.target.value,
                              });
                              setErrors({ ...errors, price: "" });
                            }}
                            placeholder="45.00"
                            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg pl-11 pr-4 py-3 text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                          />
                        </div>
                        {errors.price && (
                          <p className="text-red-400 text-sm mt-2">
                            {errors.price}
                          </p>
                        )}
                      </div>

                      <div>
                        <label
                          htmlFor="service-duration"
                          className="block text-neutral-400 text-sm mb-2"
                        >
                          Duração (minutos) *
                        </label>
                        <div className="relative">
                          <BsClock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                          <input
                            id="service-duration"
                            type="number"
                            min="0"
                            value={formData.duration}
                            onChange={(e) => {
                              setFormData({
                                ...formData,
                                duration: e.target.value,
                              });
                              setErrors({ ...errors, duration: "" });
                            }}
                            placeholder="40"
                            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg pl-11 pr-4 py-3 text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                          />
                        </div>
                        {errors.duration && (
                          <p className="text-red-400 text-sm mt-2">
                            {errors.duration}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <button
                        onClick={handleCancel}
                        className="flex-1 px-4 py-3 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 rounded-lg transition-colors font-medium cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleAddOrEditService}
                        className="flex-1 px-4 py-3 font-medium text-sm bg-amber-600 hover:bg-amber-700 text-neutral-950 rounded-lg transition-colors cursor-pointer"
                      >
                        {editingServiceId ? "Salvar" : "Adicionar"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsAddingService(true)}
                  className="w-full flex items-center justify-center gap-2 bg-neutral-800/50 hover:bg-neutral-800 border border-neutral-700 border-dashed text-neutral-400 rounded-lg py-4 transition-all cursor-pointer"
                >
                  <BiPlus /> Adicionar Novo Serviço
                </button>
              )}

              <div className="grid gap-3">
                {localServices.map((service) => (
                  <div
                    key={service.id}
                    className="bg-neutral-800/40 border border-neutral-800 rounded-lg p-4 flex items-center justify-between group hover:border-amber-600/30 transition-colors"
                  >
                    <div>
                      <h5 className="text-neutral-100 font-medium">
                        {service.name}
                      </h5>
                      <p className="text-xs text-neutral-500">
                        R$ {service.price} • {service.duration} min
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditService(service)}
                        className="p-2 text-neutral-400 hover:text-amber-500 transition-colors cursor-pointer"
                      >
                        <FiEdit2 />
                      </button>
                      <button
                        onClick={() => handleDeleteService(service.id)}
                        className="p-2 text-neutral-400 hover:text-red-500 transition-colors cursor-pointer"
                      >
                        <BsTrash2 />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <hr className="border-neutral-800" />

            <section className="space-y-6">
              <div className="flex items-center gap-2 text-amber-500">
                <BsClock className="w-5 h-5" />
                <h4 className="font-bold uppercase text-xs tracking-widest">
                  Horários de Atendimento
                </h4>
              </div>

              <div className="bg-neutral-800/30 border border-neutral-800 rounded-xl p-5 space-y-4">
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                  Segunda a Sábado
                </span>
                <div className="grid grid-cols-2 gap-4">
                  <TimeInput
                    label="Abertura"
                    value={openingTime}
                    onChange={setOpeningTime}
                  />
                  <TimeInput
                    label="Fechamento"
                    value={closingTime}
                    onChange={setClosingTime}
                  />
                </div>
              </div>

              <div className="bg-neutral-800/30 border border-neutral-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                    Domingo
                  </span>
                  <Switch
                    label={!isClosedSunday ? "Aberto" : "Fechado"}
                    checked={!isClosedSunday}
                    onChange={() => setIsClosedSunday(!isClosedSunday)}
                  />
                </div>
                {!isClosedSunday && (
                  <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1">
                    <TimeInput
                      label="Abertura"
                      value={openingSunday}
                      onChange={setOpeningSunday}
                    />
                    <TimeInput
                      label="Fechamento"
                      value={closingSunday}
                      onChange={setClosingSunday}
                    />
                  </div>
                )}
              </div>

              <div className="bg-neutral-800/30 border border-neutral-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BsClock className="text-neutral-400" />
                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                      Dia de Folga Semanal
                    </span>
                  </div>
                  <Switch
                    label={hasDayOff ? "Ativo" : "Desativado"}
                    checked={hasDayOff}
                    onChange={setHasDayOff}
                  />
                </div>

                {hasDayOff && (
                  <div className="animate-in fade-in slide-in-from-top-1">
                    <label className="text-[10px] text-neutral-500 uppercase font-bold ml-1 block mb-1.5">
                      Selecione o dia de fechamento
                    </label>
                    <select
                      value={dayOff}
                      onChange={(e) => setDayOff(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-amber-500 outline-none transition-all cursor-pointer"
                    >
                      {weekDays.map((day) => (
                        <option
                          key={day}
                          value={day}
                          className="bg-neutral-900"
                        >
                          {day}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="bg-neutral-800/30 border border-neutral-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BiCoffeeTogo className="text-neutral-400" />
                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                      Intervalo de Almoço
                    </span>
                  </div>
                  <Switch
                    label="Ativar Pausa"
                    checked={hasLunchBreak}
                    onChange={setHasLunchBreak}
                  />
                </div>
                {hasLunchBreak && (
                  <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1">
                    <TimeInput
                      label="Início Pausa"
                      value={lunchStart}
                      onChange={setLunchStart}
                    />
                    <TimeInput
                      label="Fim Pausa"
                      value={lunchEnd}
                      onChange={setLunchEnd}
                    />
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="p-3 md:p-6 border-t border-neutral-800 bg-neutral-900 flex gap-4">
            <button
              onClick={onClose}
              className="flex-1 py-y md:py-3 px-4 bg-neutral-800 hover:bg-neutral-700 text-sm md:text-base text-neutral-300 rounded-lg font-medium transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={showSuccess}
              className="flex-1 py-1 md:py-3 px-4 bg-amber-600 hover:bg-amber-700 text-sm md:text-base text-neutral-950 font-bold rounded-lg transition-colors shadow-lg shadow-amber-600/10 cursor-pointer"
            >
              Salvar Configurações
            </button>
          </div>
        </div>
      </div>

      {deletingServiceId && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={cancelDelete}
        >
          <div
            className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center bg-red-900/20 p-3 rounded-full mb-4">
                <BsTrash2 className="w-6 h-6 text-red-500" />
              </div>

              <h4 className="text-neutral-50 text-lg mb-2">Excluir Serviço</h4>

              <p className="text-neutral-400 text-sm">
                Tem certeza que deseja excluir este serviço? Esta ação não pode
                ser desfeita.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={cancelDelete}
                className="flex-1 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors cursor-pointer"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TimeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5 flex-1">
      <label className="text-[10px] text-neutral-500 uppercase font-bold ml-1">
        {label}
      </label>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-amber-500 outline-none transition-all"
      />
    </div>
  );
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <span className="text-[10px] text-neutral-500 uppercase font-bold group-hover:text-neutral-400 transition-colors">
        {label}
      </span>
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-9 h-5 bg-neutral-700 peer-checked:bg-amber-600 rounded-full transition-colors"></div>
        <div className="absolute top-1 left-1 w-3 h-3 bg-neutral-300 peer-checked:bg-white peer-checked:translate-x-4 rounded-full transition-all"></div>
      </div>
    </label>
  );
}
