"use client";

import {
  checkWhatsAppStatusAction,
  getPairingCodeAction,
} from "@/app/(dashboard)/actions";
import Image from "next/image";
import { useState, useEffect } from "react";
import { BiCheckCircle } from "react-icons/bi";
import { BsQrCode } from "react-icons/bs";
import { CgSmartphone } from "react-icons/cg";
import { FiAlertCircle } from "react-icons/fi";
import { TbLoader2 } from "react-icons/tb";

export function WhatsAppStatus({ instanceName }: { instanceName: string }) {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
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
        if (res.connected) {
          setQrCode(null);
        }
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [instanceName, isConnected]);

  async function handleGenerateCode() {
    setLoading(true);
    setQrCode(null);

    const res = await getPairingCodeAction(instanceName);
    if (res.success && res.qr) {
      setQrCode(res.qr);
    } else {
      setIsConnected(false);
    }
    setLoading(false);
  }

  if (isConnected === null) return null;

  return (
    <div className="mb-8">
      {isConnected ? (
        <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-full w-fit">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-sm font-medium text-green-700">
            IA Assistente Ativa
          </span>
          <BiCheckCircle className="w-4 h-4 text-green-600" />
        </div>
      ) : (
        <div className="relative overflow-hidden border-2 border-amber-200 bg-amber-50 rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-100 rounded-xl text-amber-600">
                <FiAlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-amber-900">
                  IA Desconectada
                </h3>
                <p className="text-sm text-amber-700 max-w-md">
                  Seu robô de agendamentos está offline. Conecte o WhatsApp para
                  que seus clientes possam marcar horários automaticamente.
                </p>
              </div>
            </div>

            {!qrCode ? (
              <button
                onClick={handleGenerateCode}
                disabled={loading}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold transition-all shadow-md active:scale-95 disabled:opacity-70 cursor-pointer"
              >
                {loading ? (
                  <TbLoader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <BsQrCode className="w-5 h-5" />
                )}
                Gerar QR Code
              </button>
            ) : (
              <div className="flex flex-col items-center bg-white p-4 rounded-xl border-2 border-amber-300 shadow-inner">
                <span className="text-xs uppercase font-bold text-gray-400 mb-1">
                  Escaneie no WhatsApp
                </span>
                <div className="text-3xl font-mono font-black tracking-[0.2em] text-amber-600 flex items-center gap-3">
                  <Image
                    src={qrCode}
                    alt="WhatsApp QR Code"
                    width={200}
                    height={40}
                  />
                </div>
                <p className="text-[10px] text-gray-500 mt-2 text-center uppercase tracking-tight">
                  No WhatsApp: Aparelhos Conectados {">"} Conectar dispositivo
                </p>
              </div>
            )}
          </div>

          <div className="absolute -right-8 -bottom-8 opacity-5">
            <CgSmartphone className="w-32 h-32 rotate-12" />
          </div>
        </div>
      )}
    </div>
  );
}
