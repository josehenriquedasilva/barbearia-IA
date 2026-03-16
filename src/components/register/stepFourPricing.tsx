import { StepFourPricingProps } from "@/types/types";
import { BiCheck } from "react-icons/bi";

const plans = [
  {
    id: "BRONZE",
    name: "Bronze",
    price: "49,90",
    features: ["Até 2 Barbeiros", "IA Básica", "Suporte via Email"],
    highlight: false,
  },
  {
    id: "SILVER",
    name: "Silver",
    price: "89,90",
    features: ["Até 5 Barbeiros", "IA Avançada", "Suporte WhatsApp"],
    highlight: true,
  },
] as const;

export default function StepFourPricing({
  selectedPlan,
  setSelectedPlan,
  onBack,
  onConfirm,
  isLoading,
  error,
}: StepFourPricingProps) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-xl font-semibold text-neutral-50">
          Escolha seu Plano
        </h3>
        <p className="text-neutral-400 text-sm">
          Selecione a melhor opção para o seu negócio
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {plans.map((plan) => (
          <div
            key={plan.id}
            onClick={() => setSelectedPlan(plan.id)}
            className={`relative p-5 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
              selectedPlan === plan.id
                ? "border-amber-600 bg-amber-600/5"
                : "border-neutral-800 bg-neutral-800/50 hover:border-neutral-700"
            }`}
          >
            {plan.highlight && (
              <span className="absolute -top-3 right-4 bg-amber-600 text-black text-[10px] font-bold px-2 py-1 rounded-full uppercase">
                Mais Popular
              </span>
            )}

            <div className="flex justify-between items-center mb-4">
              <div>
                <h4 className="text-lg font-bold text-neutral-50">
                  {plan.name}
                </h4>
                <div className="flex items-baseline gap-1">
                  <span className="text-neutral-400 text-sm">R$</span>
                  <span className="text-2xl font-black text-amber-500">
                    {plan.price}
                  </span>
                  <span className="text-neutral-500 text-xs">/mês</span>
                </div>
              </div>
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  selectedPlan === plan.id
                    ? "border-amber-600 bg-amber-600"
                    : "border-neutral-600"
                }`}
              >
                {selectedPlan === plan.id && (
                  <BiCheck className="text-black w-5 h-5" />
                )}
              </div>
            </div>

            <ul className="space-y-2">
              {plan.features.map((feature, idx) => (
                <li
                  key={idx}
                  className="flex items-center gap-2 text-sm text-neutral-300"
                >
                  <BiCheck className="text-amber-500" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {error && <p className="text-red-500 text-sm text-center">{error}</p>}

      <div className="flex gap-3 pt-3">
        <button
          onClick={onBack}
          className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg px-4 py-3 transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          Voltar
        </button>
        <button
          onClick={onConfirm}
          disabled={isLoading || !selectedPlan}
          className="flex-1 py-1 px-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-colors"
        >
          {isLoading ? "Cadastrando..." : "Finalizar Cadastro"}
        </button>
      </div>
    </div>
  );
}
