import { Service, SettingsModalProps } from "@/types/types";
import { useEffect, useState } from "react";
import { BiCheckCircle, BiPlus, BiX } from "react-icons/bi";
import { BsClock, BsScissors, BsTrash2 } from "react-icons/bs";
import { CiSettings } from "react-icons/ci";
import { FaDollarSign } from "react-icons/fa";
import { FiEdit2 } from "react-icons/fi";

export default function SettingsModal({
  isOpen,
  onClose,
  services,
  onSave,
}: SettingsModalProps) {
  const [localServices, setLocalServices] = useState<Service[]>(services);
  const [isAddingService, setIsAddingService] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [deletingServiceId, setDeletingServiceId] = useState<number | null>(
    null,
  );
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    duration: "",
  });
  const [errors, setErrors] = useState({
    name: "",
    price: "",
    duration: "",
  });

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
    onSave(localServices);
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
        onClick={handleCancel}
      >
        <div
          className="bg-neutral-900 rounded-xl border border-neutral-800 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {showSuccess && (
            <div className="absolute inset-0 bg-neutral-900/90 z-20 flex flex-col items-center justify-center animate-in fade-in duration-300">
              <BiCheckCircle className="w-16 h-16 text-amber-500 animate-bounce" />
              <h3 className="text-xl font-bold text-neutral-50 mt-4">
                Alterações Salvas!
              </h3>
              <p className="text-neutral-400">Os serviços foram atualizados.</p>
            </div>
          )}
          <div className="flex items-center justify-between p-4 md:p-6 border-b border-neutral-800">
            <div className="flex items-center gap-3">
              <div className="bg-amber-600/10 p-2 rounded-lg">
                <CiSettings className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h3 className="text-neutral-50 text-lg md:text-xl">
                  Configurações da Barbearia
                </h3>
                <p className="text-neutral-400 text-sm">
                  Gerencie os serviços e preços
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

          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            {isAddingService && (
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
                      <p className="text-red-400 text-sm mt-2">{errors.name}</p>
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
                            setFormData({ ...formData, price: e.target.value });
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
            )}

            {!isAddingService && (
              <button
                onClick={() => setIsAddingService(true)}
                className="w-full flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 border-dashed text-neutral-300 rounded-lg px-4 py-4 transition-colors mb-6 cursor-pointer hover:bg-neutral-700 hover:text-amber-600 hover:border-neutral-800"
              >
                <BiPlus className="w-5 h-5" />
                <span>Adicionar Novo Serviço</span>
              </button>
            )}

            {localServices.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-neutral-50 text-lg mb-4">
                  Serviços Cadastrados ({localServices.length})
                </h4>

                <div className="flex-1 overflow-y-auto pr-2 space-y-3 max-h-[400px] scrollbar-hide custom-scrollbar">
                  {localServices.map((service) => (
                    <div
                      key={service.id}
                      className="bg-neutral-800 border border-neutral-700 rounded-lg p-4 hover:border-amber-600/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div
                          onClick={() => handleEditService(service)}
                          className="flex-1"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <BsScissors className="w-4 h-4 text-amber-500" />
                            <h5 className="text-neutral-50">{service.name}</h5>
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-400">
                            <div className="flex items-center gap-1">
                              <FaDollarSign className="w-4 h-4" />
                              <span>R$ {Number(service.price).toFixed(2)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <BsClock className="w-4 h-4" />
                              <span>
                                {Number(service.duration).toFixed()} min
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex pt-2.5 items-center gap-2">
                          <button
                            onClick={() => handleEditService(service)}
                            className="p-2 hover:bg-neutral-700 rounded-lg transition-colors cursor-pointer"
                            title="Editar"
                          >
                            <FiEdit2 className="w-5 h-5 text-amber-500" />
                          </button>
                          <button
                            onClick={() => handleDeleteService(service.id)}
                            className="p-2 hover:bg-neutral-700 rounded-lg transition-colors cursor-pointer"
                            title="Excluir"
                          >
                            <BsTrash2 className="w-5 h-5 text-red-500" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {localServices.length === 0 && !isAddingService && (
              <div className="text-center py-12">
                <div className="bg-neutral-800/50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <BsScissors className="w-8 h-8 text-neutral-600" />
                </div>
                <p className="text-neutral-400 mb-2">
                  Nenhum serviço cadastrado
                </p>
                <p className="text-neutral-500 text-sm">
                  Comece adicionando os serviços da sua barbearia
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 py-4 px-2 md:p-6 border-t border-neutral-800">
            <button
              onClick={handleCancel}
              className="flex-1 px-2 text-sm py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg font-medium transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="flex-1 px-2 py-3 text-sm bg-amber-600 hover:bg-amber-700 text-neutral-950 rounded-lg font-medium transition-colors cursor-pointer"
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
