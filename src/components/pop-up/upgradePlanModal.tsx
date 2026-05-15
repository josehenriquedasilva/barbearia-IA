import { PLAN_LIMITS } from "@/lib/permissions";
import { BiCheck, BiCrown, BiRocket, BiX } from "react-icons/bi";

interface UpgradePlanModalProps {
  currentPlan: string;
  onClose: () => void;
}

export default function UpgradePlanModal({
  currentPlan,
  onClose,
}: UpgradePlanModalProps) {
  const isBronze = currentPlan === "BRONZE";
  const isSilver = currentPlan === "SILVER";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/90 backdrop-blur-md">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        
        {/* Header Compacto */}
        <div className="p-4 sm:p-5 border-b border-neutral-800 flex justify-between items-center bg-gradient-to-r from-amber-600/10 to-transparent shrink-0">
          <div className="flex items-center gap-2">
            <BiCrown className="text-amber-500 size-5" />
            <h2 className="text-base sm:text-lg font-bold text-neutral-50 uppercase tracking-tight">
              Gerenciar Assinatura
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 cursor-pointer transition-colors"
          >
            <BiX size={24} />
          </button>
        </div>

        {/* Área de Cards com Scroll Interno */}
        <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar space-y-4">
          
          {/* CARD BRONZE - Compacto */}
          <div
            className={`relative p-4 sm:p-5 rounded-xl border flex flex-col transition-all ${
              isBronze
                ? "border-amber-600/40 bg-neutral-800/30"
                : "border-neutral-800 bg-neutral-950/50 opacity-80"
            }`}
          >
            {isBronze && (
              <span className="absolute -top-2.5 left-4 bg-amber-600 text-neutral-950 text-[9px] px-2 py-0.5 rounded-full uppercase font-bold tracking-tighter">
                Ativo
              </span>
            )}
            <div className="flex justify-between items-baseline">
              <h3 className="text-base font-bold text-neutral-300">Bronze</h3>
              <p className="text-xl font-black text-neutral-100">
                R$ 49,90 <span className="text-xs font-normal text-neutral-500">/mês</span>
              </p>
            </div>

            <ul className="mt-3 grid grid-cols-1 gap-2">
              <li className="flex items-center gap-1.5 text-[11px] text-neutral-400">
                <BiCheck className="text-amber-500 shrink-0" /> {PLAN_LIMITS.BRONZE.maxBarbers} Barbeiros
              </li>
              <li className="flex items-center gap-1.5 text-[11px] text-neutral-400">
                <BiCheck className="text-amber-500 shrink-0" /> Agenda Online
              </li>
              <li className="flex items-center gap-1.5 text-[11px] text-neutral-400">
                <BiCheck className="text-amber-500 shrink-0" /> Suporte E-mail
              </li>
            </ul>

            {!isBronze ? (
              <button className="w-full mt-4 border border-neutral-700 hover:border-neutral-500 text-neutral-400 py-2 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer">
                Mudar para Bronze
              </button>
            ) : (
              <div className="w-full mt-4 py-2 text-center text-[10px] font-bold text-amber-600/40 uppercase tracking-widest">
                Plano Atual
              </div>
            )}
          </div>

          {/* CARD SILVER - Compacto */}
          <div
            className={`relative p-4 sm:p-5 rounded-xl border-2 flex flex-col transition-all ${
              isSilver
                ? "border-amber-500 bg-neutral-800 shadow-[0_0_15px_rgba(245,158,11,0.1)]"
                : "border-amber-500/30 bg-neutral-800/40"
            }`}
          >
            <span className="absolute -top-2.5 left-4 bg-amber-500 text-neutral-950 text-[9px] px-2 py-0.5 rounded-full uppercase font-bold tracking-tighter">
              {isSilver ? "Ativo" : "Recomendado"}
            </span>
            
            <div className="flex justify-between items-baseline">
              <h3 className={`text-base font-bold flex items-center gap-1.5 ${isSilver ? "text-amber-500" : "text-neutral-200"}`}>
                Silver <BiRocket className="size-4" />
              </h3>
              <p className="text-xl font-black text-neutral-50">
                R$ 89,90 <span className="text-xs font-normal text-neutral-400">/mês</span>
              </p>
            </div>

            <ul className="mt-3 grid grid-cols-1 gap-1.5 border-t border-neutral-700/50 pt-3">
              <li className="flex items-center gap-2 text-xs text-neutral-200">
                <BiCheck className="text-amber-500 shrink-0" /> {PLAN_LIMITS.SILVER.maxBarbers} Barbeiros
              </li>
              <li className="flex items-center gap-2 text-xs text-neutral-200">
                <BiCheck className="text-amber-500 shrink-0" /> IA de Agendamento 24h
              </li>
              <li className="flex items-center gap-2 text-xs text-neutral-200">
                <BiCheck className="text-amber-500 shrink-0" /> Suporte VIP WhatsApp
              </li>
            </ul>

            {!isSilver ? (
              <button className="w-full mt-4 bg-amber-500 hover:bg-amber-600 text-neutral-950 font-bold py-2.5 rounded-lg text-xs uppercase transition-all active:scale-95 cursor-pointer shadow-lg shadow-amber-600/10">
                Assinar Agora
              </button>
            ) : (
              <div className="w-full mt-4 py-2.5 text-center text-xs font-bold text-amber-500 uppercase tracking-widest bg-neutral-900/50 rounded-lg border border-amber-500/20">
                Plano Atual
              </div>
            )}
          </div>
        </div>

        {/* Footer Compacto */}
        <div className="p-3 border-t border-neutral-800 bg-neutral-950/30 shrink-0">
          <p className="text-center text-[9px] text-neutral-600 uppercase tracking-[2px]">
            Pagamento via Asaas
          </p>
        </div>
      </div>
    </div>
  );
}