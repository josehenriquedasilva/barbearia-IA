import { FiAlertCircle } from "react-icons/fi";
import { IoMdClose } from "react-icons/io";

export default function DeleteConfimation() {
  return (
    <div className="bg-neutral-900 rounded-xl border border-neutral-800 w-full max-w-md">
      <section className="flex justify-between items-center px-4 border-b border-neutral-800 py-3">
        <div className="flex items-center gap-3">
          <span className="bg-red-600/10 p-2 rounded-lg">
            <FiAlertCircle className="w-5 h-5 text-red-500" />
          </span>
          <p className="text-neutral-50 text-lg md:text-xl">
            Cancelar Agendamento
          </p>
        </div>
        <button className="p-2 hover:bg-neutral-800 rounded-lg transition-colors">
          <IoMdClose className="w-5 h-5 text-neutral-400" />
        </button>
      </section>

      <section className="p-4 md:p-6 space-y-4">
        <p className="text-neutral-300 text-sm md:text-base">
          Informe o motivo do cancelamento. O cliente será notificado
          automaticamente.
        </p>

        <div>
          <label
            htmlFor="cancel-reason"
            className="block text-neutral-400 text-sm mb-2"
          >
            Motivo do cancelamento *
          </label>
          <textarea
            placeholder="Ex: Cliente não compareceu, reagendado, emergência pessoal..."
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent resize-none"
            rows={4}
          />
          {/* Mensagens de erro */}
          <p className="text-red-500 text-sm mt-2">
            Por favor, informe o motivo do cancelamento
          </p>
        </div>

        <div className="bg-amber-600/10 border border-amber-600/20 rounded-lg p-3 md:p-4">
          <p className="text-amber-500 text-xs md:text-sm">
            ⚠️ Esta ação não pode ser desfeita. O cliente receberá uma
            notificação por SMS/WhatsApp informando o cancelamento e o motivo.
          </p>
        </div>
      </section>
      <section className="flex items-center gap-3 p-4 md:p-6 border-t border-neutral-800">
        <button className="flex-1 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition-colors">
          Voltar
        </button>
        <button className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">
          Confirmar Cancelamento
        </button>
      </section>
    </div>
  );
}
