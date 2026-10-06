import { PLAN_DETAILS, PlanDetail } from "@/lib/plans";
import { claimPaymentAction } from "@/lib/subscription";
import { PlanType } from "@prisma/client";
import { useState } from "react";
import {
  BiArrowBack,
  BiCheck,
  BiCheckCircle,
  BiCopy,
  BiCrown,
  BiQrScan,
  BiSpaceBar,
} from "react-icons/bi"; // Se der erro no 'react-icons/x', mude para 'react-icons/bi'
import { BiX as BiCloseIcon } from "react-icons/bi";

interface SubscriptionModalProps {
  shopId?: number;
  isOpen?: boolean;
  onClose: () => void;
  currentPlan: PlanType;
  onSelectPlan?: (planKey: PlanType) => Promise<void> | void;
}

export default function SubscriptionModal({
  isOpen = true,
  onClose,
  currentPlan,
  shopId,
  onSelectPlan,
}: SubscriptionModalProps) {
  const [loadingPlan, setLoadingPlan] = useState<PlanType | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanType | null>(null);
  const [pixCode, setPixCode] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  if (!isOpen) return null;

  const availablePlans = Object.keys(PLAN_DETAILS) as PlanType[];

  const formatPrice = (price: number) => {
    if (price === 0) return "Grátis";
    return (
      new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(price) + "/mês"
    );
  };

  const handleChoosePlan = async (planKey: PlanType) => {
    if (planKey === currentPlan) return;

    setLoadingPlan(planKey);
    try {
      if (onSelectPlan) {
        await onSelectPlan(planKey);
      }

      // Gera o Pix Copia e Cola para exibição
      const testPixPayload = `00020126580014BR.GOV.BCB.PIX0136barber-shop-${shopId || 1}-${planKey.toLowerCase()}-test5204000053039865405${PLAN_DETAILS[planKey]?.price || 0}5802BR5925Barbearia%20SaaS6009SAO%20PAULO62070503***6304E2CA`;

      setPixCode(testPixPayload);
      setSelectedPlan(planKey);
      setCopied(false);
      setSubmittedSuccess(false);
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleCopyPix = () => {
    if (!pixCode) return;
    navigator.clipboard.writeText(pixCode);
    setCopied(true);
  };

  const handleConfirmPayment = async () => {
    if (!shopId || !selectedPlan) {
      alert("Identificador da barbearia não encontrado.");
      return;
    }

    setIsSubmitting(true);
    // Chama a Server Action que salva o Payment no banco e envia a notificação no Telegram
    const result = await claimPaymentAction(shopId, selectedPlan);
    setIsSubmitting(false);

    if (result.success) {
      setSubmittedSuccess(true);
    } else {
      alert(result.error || "Erro ao comunicar pagamento ao servidor.");
    }
  };

  const handleBackToPlans = () => {
    setSelectedPlan(null);
    setPixCode("");
    setCopied(false);
    setSubmittedSuccess(false);
  };

  const handleClose = () => {
    setSelectedPlan(null);
    setPixCode("");
    setCopied(false);
    setSubmittedSuccess(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        onClick={handleClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      {/* Modal Container */}
      <div className="relative bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-3">
            {selectedPlan && !submittedSuccess ? (
              <button
                onClick={handleBackToPlans}
                type="button"
                className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 p-2 rounded-lg transition-colors cursor-pointer mr-1"
                title="Voltar aos planos"
              >
                <BiArrowBack className="w-5 h-5" />
              </button>
            ) : (
              <div className="bg-amber-600/10 p-2 rounded-lg">
                <BiCrown className="w-5 h-5 text-amber-500" />
              </div>
            )}
            <div>
              <h3 className="text-neutral-50 text-lg font-medium">
                {submittedSuccess
                  ? "🎉 Pagamento Informado"
                  : selectedPlan
                    ? "Pagamento via PIX"
                    : "Planos e Assinatura"}
              </h3>
              <p className="text-neutral-400 text-sm">
                {submittedSuccess
                  ? "Aguardando confirmação bancária"
                  : selectedPlan
                    ? `Plano selecionado: ${PLAN_DETAILS[selectedPlan]?.name}`
                    : "Escolha o plano ideal para a sua barbearia"}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            type="button"
            className="text-neutral-400 hover:text-neutral-300 hover:bg-neutral-800 p-2 rounded-lg transition-colors cursor-pointer"
          >
            <BiCloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {submittedSuccess ? (
          /* TELA DE SUCESSO / TOLERÂNCIA DE 48H */
          <div className="p-8 flex flex-col items-center justify-center text-center space-y-4">
            <div className="bg-emerald-500/10 p-4 rounded-full border border-emerald-500/20 text-emerald-500">
              <BiCheckCircle className="w-16 h-16" />
            </div>
            <h4 className="text-neutral-100 font-bold text-xl">
              Notificação enviada com sucesso!
            </h4>
            <p className="text-neutral-300 text-sm max-w-md leading-relaxed">
              Registramos o seu aviso de pagamento. O seu acesso continuará{" "}
              <strong className="text-emerald-400">
                100% liberado por até 48 horas
              </strong>{" "}
              enquanto confirmamos a entrada no banco.
            </p>
            <div className="pt-4 w-full max-w-xs">
              <button
                type="button"
                onClick={handleClose}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-neutral-950 font-bold py-3 rounded-lg transition-all cursor-pointer"
              >
                Voltar ao Dashboard
              </button>
            </div>
          </div>
        ) : selectedPlan ? (
          /* TELA DE COBRANÇA PIX */
          <div className="p-6 flex flex-col items-center justify-center text-center space-y-6 overflow-y-auto">
            <div className="bg-amber-500/10 p-4 rounded-full border border-amber-500/20">
              <BiQrScan className="w-12 h-12 text-amber-500" />
            </div>

            <div className="max-w-md">
              <h4 className="text-neutral-100 font-semibold text-xl mb-1">
                {PLAN_DETAILS[selectedPlan]?.name}
              </h4>
              <p className="text-amber-500 text-2xl font-bold">
                {formatPrice(PLAN_DETAILS[selectedPlan]?.price || 0)}
              </p>
              <p className="text-neutral-400 text-xs mt-2">
                Copie a chave Pix abaixo e realize a transferência no app do seu
                banco.
              </p>
            </div>

            {/* Input Copia e Cola */}
            <div className="w-full max-w-md space-y-2">
              <label className="text-neutral-300 text-xs font-medium block text-left">
                1. Copie o código Pix Copia e Cola:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={pixCode}
                  className="bg-neutral-950 border border-neutral-800 text-neutral-300 text-xs rounded-lg px-3 py-2.5 w-full focus:outline-none select-all font-mono"
                />
                <button
                  type="button"
                  onClick={handleCopyPix}
                  className={`px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                    copied
                      ? "bg-emerald-600 text-white"
                      : "bg-amber-600 hover:bg-amber-500 text-neutral-950"
                  }`}
                >
                  {copied ? (
                    <>
                      <BiCheck className="w-4 h-4" />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <BiCopy className="w-4 h-4" />
                      Copiar PIX
                    </>
                  )}
                </button>
              </div>

              {!copied && (
                <p className="text-amber-500/80 text-xs text-left pt-1">
                  ⚠️ Clique em <strong>Copiar PIX</strong> para liberar a
                  confirmação de pagamento.
                </p>
              )}
            </div>

            {/* Botão de Confirmação acionador do Telegram */}
            <div className="w-full max-w-md pt-2">
              <button
                type="button"
                onClick={handleConfirmPayment}
                disabled={!copied || isSubmitting}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:border disabled:border-neutral-700/50 text-neutral-950 font-bold py-3.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-neutral-950/30 border-t-neutral-950 rounded-full animate-spin" />
                ) : (
                  "2. Já fiz o Pix, confirmar pagamento"
                )}
              </button>
            </div>
          </div>
        ) : (
          /* GRID DE SELEÇÃO DE PLANOS */
          <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-5">
            {availablePlans.map((planKey) => {
              const plan: PlanDetail = PLAN_DETAILS[planKey];
              const isCurrent = currentPlan === planKey;
              const isPopular = plan.popular && !isCurrent;
              const isLoading = loadingPlan === planKey;

              return (
                <div
                  key={planKey}
                  className={`relative flex flex-col justify-between rounded-xl p-5 border transition-all ${
                    isCurrent
                      ? "bg-amber-600/10 border-amber-600/40 ring-1 ring-amber-600/30"
                      : isPopular
                        ? "bg-neutral-800/60 border-amber-500/30 hover:border-amber-500/50"
                        : "bg-neutral-800/40 border-neutral-800 hover:border-neutral-700"
                  }`}
                >
                  {/* Badges de Destaque */}
                  {isCurrent && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-600 text-neutral-950 font-semibold text-xs px-3 py-0.5 rounded-full shadow-md">
                      Seu Plano Atual
                    </span>
                  )}
                  {!isCurrent && isPopular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-neutral-700 text-amber-400 font-medium text-xs px-3 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1">
                      <BiSpaceBar className="w-3 h-3" /> Mais Popular
                    </span>
                  )}

                  <div>
                    {/* Nome e Preço */}
                    <div className="text-center pb-4 border-b border-neutral-700/50 mb-4">
                      <h4 className="text-neutral-100 font-semibold text-lg tracking-wide">
                        {plan.name}
                      </h4>
                      <p className="text-neutral-400 text-xs mt-1 min-h-[32px]">
                        {plan.description}
                      </p>
                      <div className="mt-3">
                        <span className="text-2xl font-bold text-neutral-50">
                          {formatPrice(plan.price)}
                        </span>
                      </div>
                    </div>

                    {/* Limite de Barbeiros */}
                    <div className="bg-neutral-900/60 rounded-lg p-2.5 text-center mb-4 border border-neutral-800">
                      <p className="text-neutral-300 text-xs font-medium">
                        Até{" "}
                        <strong className="text-amber-500 text-sm">
                          {plan.maxBarbers}
                        </strong>{" "}
                        {plan.maxBarbers === 1 ? "barbeiro" : "barbeiros"}
                      </p>
                    </div>

                    {/* Lista de Recursos */}
                    <ul className="space-y-2.5 mb-6 text-sm text-neutral-300">
                      {plan.features.map((feature, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2 text-xs"
                        >
                          <BiCheck className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Botão de Ação */}
                  <button
                    type="button"
                    disabled={isCurrent || isLoading}
                    onClick={() => handleChoosePlan(planKey)}
                    className={`w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                      isCurrent
                        ? "bg-neutral-800 text-neutral-400 border border-neutral-700/50 cursor-not-allowed"
                        : "bg-amber-600 hover:bg-amber-500 text-neutral-950 cursor-pointer"
                    }`}
                  >
                    {isLoading ? (
                      <div className="w-5 h-5 border-2 border-neutral-950/30 border-t-neutral-950 rounded-full animate-spin" />
                    ) : isCurrent ? (
                      "Plano Ativo"
                    ) : (
                      "Escolher Plano"
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-900/80 flex justify-between items-center shrink-0">
          {selectedPlan && !submittedSuccess ? (
            <button
              onClick={handleBackToPlans}
              type="button"
              className="text-neutral-400 hover:text-neutral-200 text-xs flex items-center gap-1 cursor-pointer"
            >
              <BiArrowBack className="w-4 h-4" /> Escolher outro plano
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={handleClose}
            type="button"
            className="bg-neutral-800 text-neutral-300 rounded-lg px-5 py-2.5 text-sm cursor-pointer hover:bg-neutral-700 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
