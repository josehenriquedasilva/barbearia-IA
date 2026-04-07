import { StepThreeProps } from "@/types/types";
import { BiCheck, BiPlus, BiX } from "react-icons/bi";
import {
  BsArrowLeft,
  BsArrowRight,
  BsClock,
  BsScissors,
  BsTrash2,
} from "react-icons/bs";
import { FiEdit2 } from "react-icons/fi";
import { IoFastFood } from "react-icons/io5";

export default function StepThreeServices({
  services,
  isAddingService,
  setIsAddingService,
  serviceForm,
  setServiceForm,
  serviceErrors,
  setServiceErrors,
  handleAddOrEditService,
  handleDeleteService,
  handleEditService,
  handleCancelServiceForm,
  openingTime,
  setOpeningTime,
  closingTime,
  setClosingTime,
  isClosedSunday,
  setIsClosedSunday,
  openingSunday,
  setOpeningSunday,
  closingSunday,
  setClosingSunday,
  hasDayOff,
  setHasDayOff,
  dayOff,
  setDayOff,
  hasLunchBreak,
  setHasLunchBreak,
  lunchStart,
  setLunchStart,
  lunchEnd,
  setLunchEnd,
  onBack,
  handleGoToStepFour,
  error,
}: StepThreeProps) {
  const weekDays = [
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
    "Domingo",
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 border-b border-neutral-700 pb-2">
        <div>
          <h3 className="text-neutral-50 text-xl mb-1">Serviços</h3>
          <p className="text-neutral-400 text-sm">
            Cadastre os serviços da sua barbearia
          </p>
        </div>
        {!isAddingService && (
          <button
            type="button"
            onClick={() => setIsAddingService(true)}
            className="bg-amber-600 hover:bg-amber-700 text-neutral-950 rounded-lg px-4 py-2 transition-colors flex items-center gap-2 text-sm font-medium cursor-pointer"
          >
            <BiPlus className="w-4 h-4" />
            <span>Adicionar</span>
          </button>
        )}
      </div>

      {isAddingService && (
        <div className="bg-neutral-800/50 border border-amber-500 rounded-lg p-5 space-y-4">
          <div>
            <label className="block text-neutral-400 text-xs uppercase tracking-wider mb-2">
              Nome do Serviço
            </label>
            <input
              type="text"
              value={serviceForm.name}
              onChange={(e) => {
                setServiceForm({ ...serviceForm, name: e.target.value });
                setServiceErrors({ ...serviceErrors, name: "" });
              }}
              className="w-full bg-neutral-900 border border-neutral-700 text-neutral-100 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent placeholder:text-neutral-600"
              placeholder="Ex: Corte de Cabelo"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-neutral-400 text-xs uppercase tracking-wider mb-2">
                Preço (R$)
              </label>
              <input
                type="number"
                step="0.01"
                value={serviceForm.price}
                onChange={(e) => {
                  setServiceForm({ ...serviceForm, price: e.target.value });
                  setServiceErrors({ ...serviceErrors, price: "" });
                }}
                className="w-full bg-neutral-900 border border-neutral-700 text-neutral-100 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent placeholder:text-neutral-600"
                placeholder="0,00"
              />
            </div>
            <div>
              <label className="block text-neutral-400 text-xs uppercase tracking-wider mb-2">
                Duração (min)
              </label>
              <input
                type="number"
                value={serviceForm.duration}
                onChange={(e) => {
                  setServiceForm({ ...serviceForm, duration: e.target.value });
                  setServiceErrors({ ...serviceErrors, duration: "" });
                }}
                className="w-full bg-neutral-900 border border-neutral-700 text-neutral-100 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent placeholder:text-neutral-600"
                placeholder="30"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleCancelServiceForm}
              className="flex-1 bg-neutral-700/50 hover:bg-neutral-700 text-neutral-300 rounded-lg py-2.5 transition-colors flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              <BiX className="w-4 h-4" />
              <span>Cancelar</span>
            </button>
            <button
              type="button"
              onClick={handleAddOrEditService}
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-neutral-950 rounded-lg px-1 py-2.5 transition-colors flex items-center justify-center gap-2 text-sm font-medium cursor-pointer"
            >
              <BiCheck className="w-4 h-4" />
              <span>Salvar Serviço</span>
            </button>
          </div>

          
        </div>
      )}

      {services.length > 0 ? (
        <div className="space-y-3">
          {services.map((service) => (
            <div
              key={service.id}
              className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-4 flex items-center justify-between group hover:border-amber-600/30 transition-colors"
            >
              <div className="flex-1">
                <h4 className="text-neutral-50">{service.name}</h4>
                <div className="flex items-center gap-4 mt-1.5">
                  <div className="flex items-center gap-1.5 text-sm text-neutral-400">
                    <BsClock className="w-3.5 h-3.5" />
                    <span>{service.duration} min</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-amber-500">
                    <span className="font-medium">R$</span>
                    <span className="font-medium">
                      {service.price.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleEditService(service)}
                  className="group p-2 hover:bg-orange-400 rounded-lg transition-colors opacity-60 hover:opacity-100 cursor-pointer"
                  title="Editar serviço"
                >
                  <FiEdit2 className="w-4 h-4 text-neutral-400" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteService(service.id)}
                  className="p-2 hover:bg-red-600 rounded-lg transition-colors opacity-60 hover:opacity-100 cursor-pointer"
                  title="Excluir serviço"
                >
                  <BsTrash2 className="w-4 h-4 text-neutral-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        !isAddingService && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center bg-neutral-800/50 p-6 rounded-full mb-4">
              <BsScissors className="w-12 h-12 text-neutral-600" />
            </div>
            <p className="text-neutral-400">Nenhum serviço cadastrado</p>
            <p className="text-neutral-500 text-sm mt-1">
              Clique em &quot;Adicionar&ldquo; para começar
            </p>
          </div>
        )
      )}

      {!isAddingService && (
        <div className="bg-neutral-800/30 border border-neutral-700 rounded-lg p-5 mt-6 space-y-6">
          <div className="flex items-center gap-2 border-b border-neutral-700/50 pb-2">
            <BsClock className="text-amber-500" />
            <h4 className="text-neutral-50 font-medium">
              Horários de Funcionamento
            </h4>
          </div>

          <div className="space-y-3">
            <span className="text-xs font-bold text-amber-500 uppercase tracking-tighter">
              Segunda a Sábado
            </span>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] text-neutral-500 uppercase font-bold">
                  Abertura
                </label>
                <input
                  type="time"
                  value={openingTime}
                  onChange={(e) => setOpeningTime(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-amber-500 outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-neutral-500 uppercase font-bold">
                  Fechamento
                </label>
                <input
                  type="time"
                  value={closingTime}
                  onChange={(e) => setClosingTime(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-amber-500 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-neutral-700/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-500 uppercase tracking-tighter">
                Dia de Folga Semanal
              </span>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={hasDayOff}
                  onChange={(e) => setHasDayOff(e.target.checked)}
                  className="sr-only peer"
                />
                <span className="text-[10px] text-neutral-400 uppercase">
                  {hasDayOff ? "Desativar" : "Ativar"}
                </span>
                <div className="w-8 h-4 bg-neutral-700 peer-checked:bg-amber-600 rounded-full relative transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-2 after:w-2 after:transition-all peer-checked:after:translate-x-4"></div>
              </label>
            </div>
            {hasDayOff && (
              <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                <select
                  value={dayOff}
                  onChange={(e) => setDayOff(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-amber-500 outline-none"
                >
                  {weekDays.map((day) => (
                    <option key={day} value={day} className="bg-neutral-900">
                      {day}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="space-y-3 pt-2 border-t border-neutral-700/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-500 uppercase tracking-tighter">
                Domingo
              </span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isClosedSunday}
                  onChange={(e) => setIsClosedSunday(e.target.checked)}
                  className="sr-only peer"
                />
                <span className="text-[10px] text-neutral-400 uppercase">
                  {isClosedSunday ? "Aberto" : "Fechado"}
                </span>
                <div className="w-8 h-4 bg-neutral-700 peer-checked:bg-amber-600 rounded-full relative transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-2 after:w-2 after:transition-all peer-checked:after:translate-x-4"></div>
              </label>
            </div>
            {isClosedSunday && (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-500 uppercase font-bold">
                    Abertura
                  </label>
                  <input
                    type="time"
                    value={openingSunday}
                    onChange={(e) => setOpeningSunday(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-amber-500 outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-500 uppercase font-bold">
                    Fechamento
                  </label>
                  <input
                    type="time"
                    value={closingSunday}
                    onChange={(e) => setClosingSunday(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-amber-500 outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 pt-2 border-t border-neutral-700/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <IoFastFood className="text-amber-500 w-3 h-3" />
                <span className="text-xs font-bold text-amber-500 uppercase tracking-tighter">
                  Intervalo de Almoço
                </span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasLunchBreak}
                  onChange={(e) => setHasLunchBreak(e.target.checked)}
                  className="sr-only peer"
                />
                <span className="text-[10px] text-neutral-400 uppercase">
                  {hasLunchBreak ? "Desativar Pausa" : "Ativar Pausa"}
                </span>
                <div className="w-8 h-4 bg-neutral-700 peer-checked:bg-amber-600 rounded-full relative transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-2 after:w-2 after:transition-all peer-checked:after:translate-x-4"></div>
              </label>
            </div>
            {hasLunchBreak && (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-500 uppercase font-bold">
                    Início
                  </label>
                  <input
                    type="time"
                    value={lunchStart}
                    onChange={(e) => setLunchStart(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-amber-500 outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-500 uppercase font-bold">
                    Fim
                  </label>
                  <input
                    type="time"
                    value={lunchEnd}
                    onChange={(e) => setLunchEnd(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-amber-500 outline-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="text-center">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={() => onBack()}
          className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg px-4 py-3 transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <BsArrowLeft className="w-5 h-5" />
          <span>Voltar</span>
        </button>

        <button
          type="button"
          onClick={handleGoToStepFour}
          className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-800 disabled:cursor-not-allowed text-neutral-950 rounded-lg px-2 transition-colors flex items-center justify-center font-medium gap-2 cursor-pointer"
        >
          <span>Próxima Etapa</span>
          <BsArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
