"use client";

import {
  checkWhatsAppStatusAction,
  getPairingCodeAction,
} from "@/app/(dashboard)/actions";
import { useState, useEffect } from "react";
import { BiCheckCircle } from "react-icons/bi";
import { FiAlertCircle } from "react-icons/fi";
import { TbLoader2 } from "react-icons/tb";
import { BsPhoneVibrate, BsWhatsapp } from "react-icons/bs";

interface WhatsAppStatusProps {
  instanceName: string;
  defaultPhoneNumber: string;
}

export function WhatsAppStatus({
  instanceName,
  defaultPhoneNumber,
}: WhatsAppStatusProps) {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function checkStatus() {
      const res = await checkWhatsAppStatusAction(instanceName);
      setIsConnected(res.connected);
    }
    checkStatus();
    const interval = setInterval(async () => {
      const res = await checkWhatsAppStatusAction(instanceName);
      if (res.connected !== isConnected) {
        setIsConnected(res.connected);
        if (res.connected) setPairingCode(null);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [instanceName, isConnected]);

  async function handleGenerateCode() {
    setLoading(true);
    const res = await getPairingCodeAction(instanceName, defaultPhoneNumber);
    if (res.success && res.pairingCode) {
      setPairingCode(res.pairingCode);
    } else {
      alert(res.error || "Erro ao gerar código.");
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
            {/* Bloco de Informação */}
            <div className="flex-1 p-6 flex items-start gap-4">
              <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-500 shrink-0 border border-amber-500/20">
                <BsWhatsapp className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  Conexão Necessária
                  <span className="text-[10px] bg-amber-500 text-black px-2 py-0.5 rounded-full uppercase tracking-tighter">
                    Offline
                  </span>
                </h3>
                <p className="text-sm text-zinc-400 max-w-md">
                  Para que a IA responda seus clientes no{" "}
                  <span className="text-zinc-200 font-semibold">
                    {defaultPhoneNumber}
                  </span>
                  , você precisa parear o dispositivo.
                </p>
              </div>
            </div>

            {/* Bloco de Ação / Código */}
            <div className="bg-zinc-900/50 border-t lg:border-t-0 lg:border-l border-zinc-800 p-6 flex items-center justify-center min-w-[300px]">
              {!pairingCode ? (
                <button
                  onClick={handleGenerateCode}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-amber-900/20 active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <TbLoader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <BsPhoneVibrate className="w-5 h-5" />
                  )}
                  {loading ? "Gerando..." : "Conectar agora"}
                </button>
              ) : (
                <div className="flex items-center gap-6 w-full justify-between lg:justify-center">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest block">
                      Seu Código
                    </span>
                    <span className="text-3xl font-mono font-black text-amber-500 tracking-[0.2em]">
                      {pairingCode}
                    </span>
                  </div>

                  <div className="h-10 w-px bg-zinc-800 hidden sm:block" />

                  <div className="max-w-[140px]">
                    <p className="text-[10px] text-zinc-400 leading-tight">
                      No WhatsApp, escolha{" "}
                      <span className="text-amber-500 font-bold italic">
                        Conectar com número de telefone
                      </span>
                    </p>
                    <button
                      onClick={() => setPairingCode(null)}
                      className="bg-amber-600 hover:bg-amber-500 text-white text-[10.5px] md:text-[12px] p-2 rounded-md mt-3 hover:text-zinc-300 transition-colors cursor-pointer"
                    >
                      Gerar Novo Código
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
