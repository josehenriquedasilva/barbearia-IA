"use client";

import { useState } from "react";
import { IoClose } from "react-icons/io5";
import { BiPhone } from "react-icons/bi";
import { TbLoader2 } from "react-icons/tb";
import { CiWarning } from "react-icons/ci";

interface ChangePhoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newPhone: string) => Promise<void>;
  currentPhone: string;
  isConnected: boolean;
  loading: boolean;
}

export default function ChangePhoneModal({
  isOpen,
  onClose,
  onConfirm,
  isConnected,
  loading,
}: ChangePhoneModalProps) {
  const [newPhone, setNewPhone] = useState("");
  const [validationError, setValidationError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");

    const digits = newPhone.replace(/\D/g, "");
    if (digits.length < 10) {
      setValidationError("Digite um número válido com DDD (ex: 11999999999)");
      return;
    }

    onConfirm(digits);
  };

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

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 bg-amber-600/10 text-amber-500 rounded-xl border border-amber-600/20">
            <BiPhone size={22} />
          </div>
          <h3 className="text-lg font-bold">Alterar Número do WhatsApp</h3>
        </div>

        {isConnected && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl flex items-start gap-2.5 text-xs mb-4">
            <CiWarning className="shrink-0 mt-0.5 size-4 text-red-500" />
            <p>
              <strong>Atenção:</strong> Sua IA está <strong>Online</strong>.
              Alterar o número agora irá desconectar a sessão atual do WhatsApp
              imediatamente.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-neutral-400 block mb-1.5 font-medium">
              Novo Número (com DDD)
            </label>
            <input
              type="text"
              placeholder="(11) 99999-9999"
              value={newPhone}
              disabled={loading}
              onChange={(e) => setNewPhone(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-50 focus:outline-none focus:border-amber-600 transition-colors disabled:opacity-50"
              autoFocus
            />
            {validationError && (
              <p className="text-red-500 text-xs mt-1.5">{validationError}</p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="w-full sm:flex-1 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-sm font-bold transition-all disabled:opacity-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:flex-1 px-4 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-600/50 text-neutral-950 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-950/20"
            >
              {loading ? (
                <>
                  <TbLoader2 className="w-4 h-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar Novo Número"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
