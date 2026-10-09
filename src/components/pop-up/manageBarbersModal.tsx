import { PLAN_LIMITS } from "@/lib/permissions";
import { PlanType } from "@prisma/client";
import { useState } from "react";
import { BiCrown, BiLock, BiUser, BiUserPlus, BiX } from "react-icons/bi";
import { CgMail } from "react-icons/cg";
import { FiEye, FiEyeOff } from "react-icons/fi";

interface ManageBarbersModalProps {
  barberModalClose: () => void;
  currentBarbersCount: number;
  plan?: PlanType;
  onOpenSubscriptionModal?: () => void;
  onAddBarber: (data: {
    name: string;
    email: string;
    password: string;
  }) => Promise<{ success: boolean; error?: string }>;
}

export default function ManageBarbersModal({
  barberModalClose,
  onAddBarber,
  currentBarbersCount,
  plan = PlanType.BRONZE,
  onOpenSubscriptionModal,
}: ManageBarbersModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const limits = PLAN_LIMITS[plan] || {
    maxBarbers: plan === "SILVER" ? 4 : 2,
    label: plan,
  };

  // CAPTURA O ESTADO DO LIMITE NO MOMENTO EM QUE O MODAL É ABERTO (MOUNT)
  // Isso evita que a re-renderização do pai altere a tela para "Limite Atingido" durante o alerta de sucesso
  const [isLimitReached] = useState(
    () => currentBarbersCount >= limits.maxBarbers,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLimitReached || success) return;
    setIsLoading(true);
    setError("");

    const result = await onAddBarber({ name, email, password });

    if (result.success) {
      setSuccess(true);

      setName("");
      setEmail("");
      setPassword("");

      setTimeout(() => {
        barberModalClose();
      }, 2000);
    } else {
      setError(result.error || "Ocorreu um erro inesperado.");
    }
    setIsLoading(false);
  };

  const handleUpgradeClick = () => {
    barberModalClose();
    if (onOpenSubscriptionModal) {
      onOpenSubscriptionModal();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        onClick={barberModalClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      <div className="relative bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header do Modal */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="bg-amber-600/10 p-2 rounded-xl border border-amber-500/20 text-amber-500">
              <BiUserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-neutral-50 text-base font-bold">
                Gerenciar Barbeiros
              </h3>
              <p className="text-neutral-400 text-xs">
                Cadastre um novo barbeiro para a equipe
              </p>
            </div>
          </div>
          <button
            onClick={barberModalClose}
            className="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 p-2 rounded-xl transition-all cursor-pointer"
          >
            <BiX className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {isLimitReached ? (
            /* BLOQUEIO QUANDO O LIMITE É ALCANÇADO (SÓ APARECE SE JÁ ABRIU O MODAL COM O LIMITE ATINGIDO) */
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6 text-center space-y-4">
              <div className="flex justify-center">
                <div className="bg-amber-500/20 p-3 rounded-full text-amber-500">
                  <BiCrown className="w-8 h-8 animate-pulse" />
                </div>
              </div>
              <div>
                <h4 className="text-neutral-100 font-bold text-base">
                  Limite de Barbeiros Atingido
                </h4>
                <p className="text-neutral-400 text-xs mt-1 leading-relaxed">
                  Seu plano <strong>{limits.label}</strong> permite até{" "}
                  <strong>
                    {limits.maxBarbers}{" "}
                    {(limits.maxBarbers as number) === 1
                      ? "barbeiro"
                      : "barbeiros"}
                  </strong>
                  . Faça upgrade para adicionar mais profissionais.
                </p>
              </div>

              <button
                type="button"
                onClick={handleUpgradeClick}
                className="w-full bg-amber-600 hover:bg-amber-500 active:scale-95 text-neutral-950 font-bold py-3 px-4 rounded-xl text-xs transition-all cursor-pointer shadow-md"
              >
                Fazer Upgrade de Plano
              </button>
            </div>
          ) : (
            /* FORMULÁRIO DE CADASTRO */
            <>
              <div>
                <label
                  htmlFor="barber-name"
                  className="block text-neutral-300 text-xs font-semibold mb-1.5"
                >
                  Nome do Barbeiro
                </label>
                <div className="relative">
                  <BiUser className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                  <input
                    id="barber-name"
                    type="text"
                    disabled={isLoading || success}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-neutral-800/80 border border-neutral-700 text-neutral-100 text-xs rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:opacity-50"
                    placeholder="Digite o nome completo"
                    required
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="barber-email"
                  className="block text-neutral-300 text-xs font-semibold mb-1.5"
                >
                  Email do Barbeiro
                </label>
                <div className="relative">
                  <CgMail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                  <input
                    id="barber-email"
                    type="email"
                    disabled={isLoading || success}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-neutral-800/80 border border-neutral-700 text-neutral-100 text-xs rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:opacity-50"
                    placeholder="barbeiro@email.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="barber-password"
                  className="block text-neutral-300 text-xs font-semibold mb-1.5"
                >
                  Senha de Acesso
                </label>
                <div className="relative">
                  <BiLock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                  <input
                    id="barber-password"
                    type={showPassword ? "text" : "password"}
                    disabled={isLoading || success}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-neutral-800/80 border border-neutral-700 text-neutral-100 text-xs rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:opacity-50"
                    placeholder="Mínimo 6 caracteres"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200"
                  >
                    {showPassword ? (
                      <FiEye className="w-4 h-4" />
                    ) : (
                      <FiEyeOff className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="bg-red-900/20 border border-red-800/80 text-red-400 rounded-xl px-3.5 py-2.5 text-xs">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-emerald-900/20 border border-emerald-800/80 text-emerald-400 rounded-xl px-3.5 py-2.5 text-xs font-semibold flex items-center gap-2">
              <span>✅ Barbeiro cadastrado com sucesso!</span>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={barberModalClose}
              type="button"
              className="flex-1 bg-neutral-800 text-neutral-300 rounded-xl px-4 py-2.5 text-xs font-semibold cursor-pointer hover:bg-neutral-700 transition-all"
            >
              Cancelar
            </button>
            {!isLimitReached && (
              <button
                type="submit"
                disabled={isLoading || success}
                className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800/50 disabled:text-neutral-400 text-neutral-950 font-bold rounded-xl px-4 py-2.5 text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-neutral-950/30 border-t-neutral-950 rounded-full animate-spin" />
                ) : (
                  <span>Cadastrar</span>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
