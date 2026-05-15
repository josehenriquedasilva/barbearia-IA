"use client";

import {
  checkWhatsAppStatusAction,
  getPairingCodeAction,
} from "@/app/(dashboard)/actions";
import { useState, useEffect } from "react";
import { BiCheckCircle, BiErrorCircle } from "react-icons/bi";
import { TbLoader2 } from "react-icons/tb";
import { BsPhoneVibrate, BsWhatsapp } from "react-icons/bs";
import { formatPhone } from "@/utils/formatters";
import { IoClose } from "react-icons/io5";

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
  const [pairingCode, setPairingCode] = useState<string | null>("019293");
  const [loading, setLoading] = useState(false);
  const formattedPhone = formatPhone(defaultPhoneNumber);
  const [error, setError] = useState<string | null>(null);

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

  if (isConnected === null) return null;

  return (
    <div className="mb-8 w-full">
      {isConnected ? (
        <div className="flex items-center gap-3 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-xl w-fit">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-sm font-bold text-green-500">
            IA Assistente Ativa
          </span>
          <BiCheckCircle className="w-5 h-5 text-green-500" />
        </div>
      ) : (
        <div className="bg-[#1a1a1a] border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="flex flex-col lg:flex-row items-stretch">
            <div className="flex-1 p-6 flex items-start gap-4">
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
                  Para que a IA responda seus clientes no{" "}
                  <span className="text-zinc-200 font-semibold underline decoration-amber-500/30">
                    {formattedPhone}
                  </span>
                  , você precisa parear o dispositivo.
                </p>
              </div>
            </div>

            <div className="bg-zinc-900/50 border-t lg:border-t-0 lg:border-l border-zinc-800 p-6 flex flex-col items-center justify-center min-w-[320px] gap-4">
              {error && (
                <div className="w-full bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <BiErrorCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-[11px] font-bold text-red-500 uppercase tracking-wider">
                      Erro de Conexão
                    </p>
                    <p className="text-xs text-red-200/70 leading-tight">
                      {error}
                    </p>
                  </div>
                  <button
                    onClick={() => setError(null)}
                    className="text-red-500/50 hover:text-red-500 transition-colors"
                  >
                    <IoClose className="cursor-pointer" size={16} />
                  </button>
                </div>
              )}

              {!pairingCode ? (
                <button
                  onClick={handleGenerateCode}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-amber-900/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {loading ? (
                    <TbLoader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <BsPhoneVibrate className="w-5 h-5" />
                  )}
                  {loading ? "Gerando código..." : "Gerar Código de Pareamento"}
                </button>
              ) : (
                <div className="flex items-center gap-6 w-full justify-between lg:justify-center animate-in zoom-in-95 duration-300">
                  <div className="space-y-1 text-center lg:text-left">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest block">
                      Seu Código
                    </span>
                    <span className="text-4xl font-mono font-black text-amber-500 tracking-[0.2em] drop-shadow-[0_0_8px_rgba(245,158,11,0.3)]">
                      {pairingCode}
                    </span>
                  </div>

                  <div className="h-10 w-px bg-zinc-800 hidden sm:block" />

                  <div className="max-w-[140px] flex flex-col items-center">
                    <p className="text-[10px] text-zinc-400 leading-tight flex flex-col">
                      No WhatsApp, escolha{" "}
                      <span className="text-amber-500 font-bold italic">
                        Conectar com número
                      </span>
                    </p>
                    <button
                      onClick={() => {
                        setPairingCode(null);
                        handleGenerateCode();
                      }}
                      className="text-[11px] mt-3 hover:text-amber-400 cursor-pointer flex items-center gap-1 bg-amber-500 p-2 hover:bg-amber-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-amber-900/20"
                    >
                      Gerar novo código
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
