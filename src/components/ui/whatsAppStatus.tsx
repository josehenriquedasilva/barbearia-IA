"use client";

import {
  checkWhatsAppStatusAction,
  getPairingCodeAction,
  disconnectWhatsAppAction,
  updateShopPhoneAction,
} from "@/app/(dashboard)/actions";
import { useState, useEffect } from "react";
import { BiErrorCircle, BiRefresh, BiEdit } from "react-icons/bi";
import { TbLoader2 } from "react-icons/tb";
import { BsPhoneVibrate, BsWhatsapp } from "react-icons/bs";
import { formatPhone } from "@/utils/formatters";
import { IoClose } from "react-icons/io5";
import DisconnectModal from "@/components/pop-up/disconnectModal";
import ChangePhoneModal from "@/components/pop-up/changePhoneModal";
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
  const [isChangeModalOpen, setIsChangeModalOpen] = useState(false);

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

  async function handleChangePhoneConfirm(newPhone: string) {
    setLoading(true);
    setError(null);

    if (isConnected) {
      const disconnectRes = await disconnectWhatsAppAction(shopId, slug);
      if (!disconnectRes.success) {
        setError(
          "Não foi possível desligar o número atual na Evolution API. Tente novamente.",
        );
        setLoading(false);
        setIsChangeModalOpen(false);
        return;
      }
    }

    const res = await updateShopPhoneAction(shopId, newPhone);
    if (res.success) {
      setIsConnected(false);
      setPairingCode(null);
      setIsChangeModalOpen(false);
    } else {
      setError(res.error || "Erro ao atualizar o número.");
      setIsChangeModalOpen(false);
    }
    setLoading(false);
  }

  if (isConnected === null) return null;

  return (
    <div className="mb-3 w-full">
      {error && (
        <div className="w-full bg-red-500/5 border border-red-500/10 rounded-xl p-2.5 flex items-start gap-2.5 mb-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <BiErrorCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">
              Erro de Conexão
            </p>
            <p className="text-xs text-red-200/60 leading-tight">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            <IoClose size={14} />
          </button>
        </div>
      )}

      {isConnected ? (
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl shadow-md p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 animate-in fade-in duration-300">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/5 rounded-xl text-green-500 shrink-0 border border-green-500/10 relative">
              <BsWhatsapp className="w-4 h-4" />
              <div className="w-2 h-2 bg-green-500 rounded-full border border-zinc-900 absolute -top-0.5 -right-0.5 animate-pulse" />
            </div>
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2 tracking-tight">
                IA Assistente Ativa
                <span className="text-[9px] bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded font-medium border border-green-500/10 uppercase tracking-wide">
                  Online
                </span>
              </h3>
              <p className="text-xs text-zinc-400 flex flex-wrap items-center gap-1">
                Atendendo no número{" "}
                <span className="text-zinc-200 font-medium underline underline-offset-2 decoration-green-500/20">
                  {formattedPhone}
                </span>
                <button
                  onClick={() => setIsChangeModalOpen(true)}
                  className="text-[11px] text-amber-500 hover:text-amber-400 ml-1 inline-flex items-center gap-0.5 cursor-pointer transition-colors font-medium"
                >
                  <BiEdit size={12} /> Número errado?
                </button>
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full sm:w-auto px-3 py-1.5 bg-red-500/5 hover:bg-red-500/10 text-red-400 border border-red-500/10 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.99]"
          >
            <VscDebugDisconnect size={13} />
            Desconectar
          </button>
        </div>
      ) : (
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden shadow-md">
          <div className="flex flex-col md:flex-row items-stretch">
            <div className="flex-1 p-4 flex items-center gap-3">
              <div className="p-2 bg-amber-500/5 rounded-xl text-amber-500 shrink-0 border border-amber-500/10">
                <BsWhatsapp className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2 tracking-tight">
                  Conexão Necessária
                  <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded font-medium border border-amber-500/10 uppercase tracking-wide">
                    Offline
                  </span>
                </h3>
                <p className="text-xs text-zinc-400 flex flex-wrap items-center gap-1">
                  Para ativar o agente de IA no{" "}
                  <span className="text-zinc-200 font-medium underline underline-offset-2 decoration-amber-500/20">
                    {formattedPhone}
                  </span>
                  , efetue o pareamento.
                  <button
                    onClick={() => setIsChangeModalOpen(true)}
                    className="text-[11px] text-amber-500 hover:text-amber-400 ml-1 inline-flex items-center gap-0.5 cursor-pointer transition-colors font-medium"
                  >
                    <BiEdit size={12} /> Número errado?
                  </button>
                </p>
              </div>
            </div>

            <div className="bg-zinc-950/40 border-t md:border-t-0 md:border-l border-zinc-800/60 p-4 flex flex-col items-center justify-center min-w-full md:min-w-[280px] lg:min-w-[310px] gap-3">
              {!pairingCode ? (
                <button
                  onClick={handleGenerateCode}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/40 text-zinc-950 rounded-lg text-xs font-semibold transition-all shadow-sm active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <TbLoader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <BsPhoneVibrate className="w-3.5 h-3.5" />
                  )}
                  {loading ? "Gerando..." : "Gerar Código"}
                </button>
              ) : (
                <div className="w-full flex items-center justify-between gap-4 animate-in zoom-in-95 duration-200">
                  <div className="flex flex-col space-y-0.5">
                    <span className="text-[8px] uppercase font-bold text-zinc-500 tracking-wider">
                      Seu Código
                    </span>
                    <span className="text-2xl font-mono font-bold text-amber-500 tracking-wider drop-shadow-[0_0_6px_rgba(245,158,11,0.15)]">
                      {pairingCode}
                    </span>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 max-w-[160px]">
                    <p className="text-[10px] text-zinc-400 leading-tight text-right">
                      No app, clique em{" "}
                      <span className="text-amber-500 font-medium">
                        Conectar com número
                      </span>
                    </p>

                    <button
                      onClick={() => {
                        setPairingCode(null);
                        handleGenerateCode();
                      }}
                      className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-300 bg-zinc-800/60 hover:bg-zinc-800 px-2 py-1 rounded transition-colors cursor-pointer border border-zinc-700/50"
                    >
                      <BiRefresh className="w-3 h-3" />
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

      <ChangePhoneModal
        isOpen={isChangeModalOpen}
        loading={loading}
        isConnected={!!isConnected}
        currentPhone={defaultPhoneNumber}
        onClose={() => setIsChangeModalOpen(false)}
        onConfirm={handleChangePhoneConfirm}
      />
    </div>
  );
}
