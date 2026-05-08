import { PLAN_LIMITS } from "@/lib/permissions";
import { BiCheck, BiCrown, BiRocket, BiX } from "react-icons/bi";

interface UpgradePlanModalProps {
  currentPlan: string;
  onClose: () => void;
  //onUpgrade: (plan: string) => void;
}

export default function UpgradePlanModal({
  currentPlan,
  onClose,
  //onUpgrade,
}: UpgradePlanModalProps) {
  const isBronze = currentPlan === "BRONZE";
  const isSilver = currentPlan === "SILVER";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-neutral-800 flex justify-between items-center bg-gradient-to-r from-amber-600/10 to-transparent">
          <div className="flex items-center gap-3">
            <BiCrown className="text-amber-500 size-6" />
            <h2 className="text-xl font-bold text-neutral-50">
              Gerenciar Assinatura
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-2 cursor-pointer transition-colors"
          >
            <BiX size={24} />
          </button>
        </div>

        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          <div
            className={`relative p-6 rounded-xl border flex flex-col transition-all duration-300 ${
              isBronze
                ? "border-amber-600/40 bg-neutral-800/30"
                : "border-neutral-800 bg-neutral-950/50 opacity-70 hover:opacity-100"
            }`}
          >
            {isBronze && (
              <span className="absolute -top-3 left-4 bg-amber-600 text-neutral-950 text-[10px] px-2 py-1 rounded-full uppercase font-bold tracking-widest">
                Plano Ativo
              </span>
            )}
            <h3 className="text-lg font-bold text-neutral-300">Bronze</h3>
            <p className="text-2xl font-black text-neutral-100 mt-2">
              R$ 49,90
              <span className="text-sm font-normal text-neutral-500">/mês</span>
            </p>

            <ul className="mt-6 space-y-3 flex-1">
              <li className="flex items-center gap-2 text-sm text-neutral-400">
                <BiCheck className={isBronze ? "text-amber-500" : ""} />{" "}
                {PLAN_LIMITS.BRONZE.maxBarbers} Barbeiros
              </li>
              <li className="flex items-center gap-2 text-sm text-neutral-400">
                <BiCheck className={isBronze ? "text-amber-500" : ""} /> Agenda
                Online
              </li>
              <li className="flex items-center gap-2 text-sm text-neutral-400">
                <BiCheck className={isBronze ? "text-amber-500" : ""} /> Suporte
                E-mail
              </li>
            </ul>

            {!isBronze ? (
              <button
                //onClick={() => onUpgrade("BRONZE")}
                className="w-full mt-8 border border-neutral-700 hover:border-neutral-500 text-neutral-400 hover:text-neutral-200 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                Mudar para Bronze
              </button>
            ) : (
              <div className="w-full mt-8 py-2.5 text-center text-xs font-bold text-amber-600/50 uppercase tracking-widest">
                Plano Atual
              </div>
            )}
          </div>

          <div
            className={`relative p-6 rounded-xl border-2 flex flex-col transition-all duration-500 ${
              isSilver
                ? "border-amber-500 bg-neutral-800 shadow-[0_0_20px_rgba(245,158,11,0.15)]"
                : "border-amber-500/30 bg-neutral-800/40 hover:border-amber-500 md:scale-105"
            }`}
          >
            {isSilver ? (
              <span className="absolute -top-3 left-4 bg-amber-500 text-neutral-950 text-[10px] px-2 py-1 rounded-full uppercase font-bold tracking-widest">
                Plano Ativo
              </span>
            ) : (
              <span className="absolute -top-3 left-4 bg-amber-500 text-neutral-950 text-[10px] px-2 py-1 rounded-full uppercase font-bold tracking-widest">
                Recomendado
              </span>
            )}
            <h3
              className={`text-lg font-bold flex items-center gap-2 ${isSilver ? "text-amber-500" : "text-neutral-200"}`}
            >
              Silver <BiRocket />
            </h3>
            <p className="text-3xl font-black text-neutral-50 mt-2">
              R$ 89,90
              <span className="text-sm font-normal text-neutral-400">/mês</span>
            </p>

            <ul className="mt-6 space-y-3 flex-1">
              <li className="flex items-center gap-2 text-sm text-neutral-200">
                <BiCheck className="text-amber-500" /> Até{" "}
                {PLAN_LIMITS.SILVER.maxBarbers} Barbeiros
              </li>
              <li className="flex items-center gap-2 text-sm text-neutral-200">
                <BiCheck className="text-amber-500" /> IA de Agendamento 24h
              </li>
              <li className="flex items-center gap-2 text-sm text-neutral-200">
                <BiCheck className="text-amber-500" /> Suporte VIP WhatsApp
              </li>
            </ul>

            {!isSilver ? (
              <button
                //onClick={() => onUpgrade("SILVER")}
                className="w-full mt-8 bg-amber-500 hover:bg-amber-600 text-neutral-950 font-bold py-3 rounded-lg transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-600/20"
              >
                Assinar Agora
              </button>
            ) : (
              <div className="w-full mt-8 py-3 text-center text-sm font-bold text-amber-500 uppercase tracking-widest bg-neutral-900/50 rounded-lg border border-amber-500/20">
                Plano Atual
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-[10px] text-neutral-600 pb-8 uppercase tracking-widest">
          Ambiente de teste • Asaas Sandbox
        </p>
      </div>
    </div>
  );
}
