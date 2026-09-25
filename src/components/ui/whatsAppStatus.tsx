"use client";

import {
  checkWhatsAppStatusAction,
  getPairingCodeAction,
  disconnectWhatsAppAction,
  updateShopPhoneAction,
} from "@/app/(dashboard)/actions";
import { useState, useEffect } from "react";
import {
  BiErrorCircle,
  BiRefresh,
  BiEdit,
  BiCopy,
  BiCheck,
} from "react-icons/bi";
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
  slug,
  defaultPhoneNumber,
}: WhatsAppStatusProps) {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isChangeModalOpen, setIsChangeModalOpen] = useState(false);

  const formattedPhone = formatPhone(defaultPhoneNumber);

  useEffect(() => {
    async function checkStatus() {
      const res = await checkWhatsAppStatusAction();
      setIsConnected(res.connected);
    }
    checkStatus();
    const interval = setInterval(async () => {
      const res = await checkWhatsAppStatusAction();
      if (res.connected !== isConnected) {
        setIsConnected(res.connected);
        if (res.connected) {
          setPairingCode(null);
          setError(null);
        }
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [isConnected]);

  async function handleGenerateCode() {
    setLoading(true);
    setError(null);
    setCopied(false);
    const res = await getPairingCodeAction(defaultPhoneNumber);
    if (res.success && res.pairingCode) {
      setPairingCode(res.pairingCode);
    } else {
      setError(
        res.error || "Não foi possível gerar o código. Tente novamente.",
      );
    }
    setLoading(false);
  }

  async function handleCopyCode() {
    if (!pairingCode) return;
    try {
      await navigator.clipboard.writeText(pairingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Erro ao copiar o código.");
    }
  }

  async function handleDisconnect() {
    setLoading(true);
    setError(null);
    const res = await disconnectWhatsAppAction(slug);
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
      const disconnectRes = await disconnectWhatsAppAction(slug);
      if (!disconnectRes.success) {
        setError("Não foi possível desligar o número atual. Tente novamente.");
        setLoading(false);
        setIsChangeModalOpen(false);
        return;
      }
    }

    const res = await updateShopPhoneAction(newPhone);
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
    <div className="mb-4 w-full">
      {/* Banner de Erro Simplificado */}
      {error && (
        <div className="w-full bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-center justify-between gap-2 mb-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 min-w-0">
            <BiErrorCircle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-200 truncate">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-zinc-400 hover:text-zinc-200 p-1 shrink-0 cursor-pointer"
            aria-label="Fechar erro"
          >
            <IoClose size={16} />
          </button>
        </div>
      )}

      {/* Card Principal Clean */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
        {/* Topo: Status & Número */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`p-2.5 rounded-xl shrink-0 border ${
                isConnected
                  ? "bg-green-500/10 text-green-400 border-green-500/20"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/20"
              }`}
            >
              <BsWhatsapp className="w-5 h-5" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-100 truncate">
                  WhatsApp IA
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    isConnected
                      ? "bg-green-500/10 text-green-400 border border-green-500/20"
                      : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isConnected
                        ? "bg-green-400 animate-pulse"
                        : "bg-amber-400"
                    }`}
                  />
                  {isConnected ? "Online" : "Offline"}
                </span>
              </div>

              {/* Número + Botão Trocar */}
              <div className="flex items-center gap-1.5 mt-1 text-xs text-zinc-400">
                <span className="font-medium text-zinc-300">
                  {formattedPhone}
                </span>
                <button
                  onClick={() => setIsChangeModalOpen(true)}
                  className="text-amber-500 hover:text-amber-400 p-0.5 rounded transition-colors inline-flex items-center gap-0.5 font-medium text-[11px] cursor-pointer"
                  title="Alterar número"
                >
                  <BiEdit size={13} />
                  <span>Trocar</span>
                </button>
              </div>
            </div>
          </div>

          {/* Botão de Desconectar (se conectado) */}
          {isConnected && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 active:scale-95 cursor-pointer"
            >
              <VscDebugDisconnect size={14} />
              <span className="hidden sm:inline">Desconectar</span>
            </button>
          )}
        </div>

        {/* Área de Conexão / Gerar Código */}
        {!isConnected && (
          <div className="pt-3 border-t border-zinc-800/60">
            {!pairingCode ? (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Conecte a IA ao seu WhatsApp gerando um código de pareamento.
                </p>
                <button
                  onClick={handleGenerateCode}
                  disabled={loading}
                  className="w-full sm:w-auto px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shrink-0 active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  {loading ? (
                    <TbLoader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <BsPhoneVibrate className="w-4 h-4" />
                  )}
                  {loading ? "Gerando..." : "Gerar Código"}
                </button>
              </div>
            ) : (
              /* Display do Código + Ações */
              <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
                <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-center sm:text-left space-y-0.5">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block">
                      Código de Pareamento
                    </span>
                    <span className="text-2xl sm:text-3xl font-mono font-extrabold text-amber-500 tracking-widest block">
                      {pairingCode}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {/* Botão Copiar Código */}
                    <button
                      onClick={handleCopyCode}
                      className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer ${
                        copied
                          ? "bg-green-500/20 text-green-400 border border-green-500/30"
                          : "bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-sm"
                      }`}
                    >
                      {copied ? (
                        <>
                          <BiCheck size={16} />
                          Copiado!
                        </>
                      ) : (
                        <>
                          <BiCopy size={16} />
                          Copiar Código
                        </>
                      )}
                    </button>

                    {/* Recarregar Código */}
                    <button
                      onClick={handleGenerateCode}
                      disabled={loading}
                      title="Gerar novo código"
                      className="p-2.5 bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/60 rounded-xl transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      {loading ? (
                        <TbLoader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <BiRefresh size={18} />
                      )}
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-zinc-500 text-center sm:text-left leading-tight">
                  No WhatsApp:{" "}
                  <span className="text-zinc-400">
                    Configurações &gt; Aparelhos conectados &gt; Conectar um
                    aparelho &gt; Conectar com número
                  </span>
                  .
                </p>
              </div>
            )}
          </div>
        )}
      </div>

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
