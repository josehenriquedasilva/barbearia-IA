"use client";

import { IoClose, IoWarningOutline } from "react-icons/io5";
import { TbLoader2 } from "react-icons/tb";

interface DisconnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}

export default function DisconnectModal({
  isOpen,
  onClose,
  onConfirm,
  loading,
}: DisconnectModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={loading ? undefined : onClose}
      />

      <div className="relative bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md p-6 shadow-2xl text-neutral-50 animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-200 p-1 rounded-lg hover:bg-neutral-800 transition-colors disabled:opacity-30 cursor-pointer"
        >
          <IoClose size={20} />
        </button>

        <div className="flex flex-col items-center text-center mt-2">
          <div className="p-3 bg-red-500/10 text-red-500 rounded-2xl border border-red-500/20 mb-4">
            <IoWarningOutline size={28} />
          </div>

          <h3 className="text-lg font-bold text-neutral-50">
            Desconectar Assistente Virtual?
          </h3>

          <p className="text-sm text-neutral-400 mt-2 leading-relaxed">
            Tem certeza que deseja desconectar o WhatsApp da sua IA? Ela <strong>parará de responder</strong> seus clientes e agendar
            horários imediatamente.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="w-full sm:flex-1 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-sm font-bold transition-all disabled:opacity-50 cursor-pointer text-center"
          >
            Cancelar
          </button>

          <button
            onClick={onConfirm}
            disabled={loading}
            className="w-full sm:flex-1 px-4 py-3 bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-red-950/20"
          >
            {loading ? (
              <>
                <TbLoader2 className="w-4 h-4 animate-spin" />
                Desconectando...
              </>
            ) : (
              "Sim, Desconectar"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
