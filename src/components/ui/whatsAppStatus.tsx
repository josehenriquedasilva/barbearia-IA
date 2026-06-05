"use client";

import {
  checkWhatsAppStatusAction,
  getPairingCodeAction,
  disconnectWhatsAppAction,
} from "@/app/(dashboard)/actions";
import { useState, useEffect } from "react";
import { BiErrorCircle, BiRefresh } from "react-icons/bi";
import { TbLoader2 } from "react-icons/tb";
import { BsPhoneVibrate, BsWhatsapp } from "react-icons/bs";
import { formatPhone } from "@/utils/formatters";
import { IoClose } from "react-icons/io5";
import DisconnectModal from "@/components/pop-up/disconnectModal";
import { VscDebugDisconnect } from "react-icons/vsc";

interface WhatsAppStatusProps {
  shopId: number;
  slug: string;
  defaultPhoneNumber: string;
}

export function WhatsAppStatus({
  shopId,
  slug,
  defaultPhoneNumber,
}: WhatsAppStatusProps) {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const formattedPhone = formatPhone(defaultPhoneNumber);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    async function checkStatus() {
      const res = await checkWhatsAppStatusAction(slug);
      setIsConnected(res.connected);
    }
    checkStatus();
    const interval = setInterval(async () => {
      const res = await checkWhatsAppStatusAction(slug);
      if (res.connected !== isConnected) {
        setIsConnected(res.connected);
        if (res.connected) {
          setPairingCode(null);
          setError(null);
        }
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [slug, isConnected]);

  async function handleGenerateCode() {
    setLoading(true);
    setError(null);
    const res = await getPairingCodeAction(shopId, defaultPhoneNumber);
    if (res.success && res.pairingCode) {
      setPairingCode(res.pairingCode);
    } else {
      setError(
        res.error || "Não foi possível gerar o código. Tente novamente.",
      );
    }
    setLoading(false);
  }

  async function handleDisconnect() {
    setLoading(true);
    setError(null);
    const res = await disconnectWhatsAppAction(shopId, slug);
    if (res.success) {
      setIsConnected(false);
      setPairingCode(null);
      setIsModalOpen(false);
    } else {
      setError(res.error || "Erro ao desconectar. Tente novamente.");
      setIsModalOpen(false);
    }
    setLoading(false);
  }

  if (isConnected === null) return null;

  return (
    <div className="mb-2 w-full">
      {error && (
        <div className="w-full bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-3 mb-4 animate-in fade-in slide-in-from-top-2">
          <BiErrorCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[11px] font-bold text-red-500 uppercase tracking-wider">
              Erro
            </p>
            <p className="text-xs text-red-200/70">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-zinc-500 hover:text-white cursor-pointer"
          >
            <IoClose size={16} />
          </button>
        </div>
      )}

      {isConnected ? (
        <div className="bg-[#1a1a1a] border border-zinc-800 rounded-2xl overflow-hidden shadow-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-300">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-green-500/10 rounded-2xl text-green-500 shrink-0 border border-green-500/20 relative">
              <BsWhatsapp className="w-6 h-6" />
              <div className="w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#1a1a1a] absolute -top-0.5 -right-0.5 animate-pulse" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                IA Assistente Ativa
                <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full uppercase tracking-tighter font-bold border border-green-500/30">
                  Online
                </span>
              </h3>
              <p className="text-sm text-zinc-400 max-w-md leading-relaxed">
                O assistente virtual está conectado e respondendo no número{" "}
                <span className="text-zinc-200 font-semibold underline decoration-green-500/30">
                  {formattedPhone}
                </span>
                .
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full sm:w-auto px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
          >
            <VscDebugDisconnect size={14} />
            Desconectar Número
          </button>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="flex flex-col lg:flex-row items-stretch">
            <div className="flex-1 p-5 sm:p-6 flex items-start gap-4">
              <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-500 shrink-0 border border-amber-500/20">
                <BsWhatsapp className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  Conexão Necessária
                  <span className="text-[10px] bg-amber-500 text-black px-2 py-0.5 rounded-full uppercase tracking-tighter font-bold">
                    Offline
                  </span>
                </h3>
                <p className="text-sm text-zinc-400 max-w-md leading-relaxed">
                  Para que a IA responda no{" "}
                  <span className="text-zinc-200 font-semibold underline decoration-amber-500/30">
                    {formattedPhone}
                  </span>
                  , você precisa parear o dispositivo.
                </p>
              </div>
            </div>

            <div className="bg-zinc-900/50 border-t lg:border-t-0 lg:border-l border-zinc-800 p-5 sm:p-6 flex flex-col items-center justify-center min-w-full lg:min-w-[340px] gap-4">
              {!pairingCode ? (
                <button
                  onClick={handleGenerateCode}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <TbLoader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <BsPhoneVibrate className="w-5 h-5" />
                  )}
                  {loading ? "Gerando..." : "Gerar Código"}
                </button>
              ) : (
                <div className="w-full flex flex-col sm:flex-row items-center gap-5 sm:gap-6 animate-in zoom-in-95 duration-300">
                  <div className="flex flex-col items-center sm:items-start space-y-1">
                    <span className="text-[9px] uppercase font-bold text-zinc-500 tracking-[0.2em]">
                      Seu Código
                    </span>
                    <span className="text-4xl font-mono font-black text-amber-500 tracking-[0.15em] drop-shadow-[0_0_8px_rgba(245,158,11,0.3)]">
                      {pairingCode}
                    </span>
                  </div>

                  <div className="h-12 w-px bg-zinc-800 hidden sm:block" />

                  <div className="flex-1 flex flex-col items-center sm:items-start text-center sm:text-left gap-3">
                    <p className="text-[11px] text-zinc-400 leading-tight">
                      No WhatsApp, toque em <br />
                      <span className="text-amber-500 font-bold">
                        Conectar com número
                      </span>
                    </p>

                    <button
                      onClick={() => {
                        setPairingCode(null);
                        handleGenerateCode();
                      }}
                      className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg transition-colors cursor-pointer border border-zinc-700"
                    >
                      <BiRefresh className="w-4 h-4" />
                      Novo Código
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <DisconnectModal
        isOpen={isModalOpen}
        loading={loading}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleDisconnect}
      />
    </div>
  );
}
