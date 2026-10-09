import { PLAN_DETAILS, PlanDetail } from "@/lib/plans";
import { claimPaymentAction } from "@/lib/subscription";
import { PlanType } from "@prisma/client";
import { useState } from "react";
import {
  BiArrowBack,
  BiCheck,
  BiCheckCircle,
  BiCheckShield,
  BiCopy,
  BiCrown,
  BiGift,
  BiInfoCircle,
  BiQrScan,
  BiRefresh,
  BiStar,
  BiX as BiCloseIcon,
} from "react-icons/bi";

interface SubscriptionModalProps {
  shopId?: number;
  isOpen?: boolean;
  onClose: () => void;
  currentPlan: PlanType;
  subscriptionStatus?: string;
  subscriptionEnd?: Date | string | null;
  onSelectPlan?: (planKey: PlanType) => Promise<void> | void;
}

export default function SubscriptionModal({
  isOpen = true,
  onClose,
  currentPlan,
  shopId,
  subscriptionStatus = "ACTIVE",
  subscriptionEnd,
  onSelectPlan,
}: SubscriptionModalProps) {
  const [loadingPlan, setLoadingPlan] = useState<PlanType | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanType | null>(null);
  const [pixCode, setPixCode] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  const REAL_PIX_KEY =
    process.env.NEXT_PUBLIC_PIX_KEY || "sua-chave-pix@exemplo.com";

  if (!isOpen) return null;

  const availablePlans = Object.keys(PLAN_DETAILS) as PlanType[];

  // Filtra para exibir nos cards apenas os planos QUE NÃO SÃO o atual
  const otherPlans = availablePlans.filter((plan) => plan !== currentPlan);

  // Detalhes do plano atual do usuário
  const currentPlanDetails: PlanDetail | undefined = PLAN_DETAILS[currentPlan];

  // --- IDENTIFICAÇÃO DO TESTE GRÁTIS ---
  const isTrial = subscriptionStatus === "TRIAL";

  // --- CÁLCULO DE DIAS PARA O VENCIMENTO ---
  const endDate = subscriptionEnd ? new Date(subscriptionEnd) : null;
  const now = new Date();
  const daysRemaining = endDate
    ? Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // A liberação para contratar/renovar o plano atual ocorre se for TRIAL, EXPIRED, PENDING_APPROVAL ou faltar <= 10 dias
  const canRenewCurrentPlan =
    isTrial ||
    subscriptionStatus === "EXPIRED" ||
    subscriptionStatus === "PENDING_APPROVAL" ||
    (daysRemaining !== null && daysRemaining <= 10);

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
    if (planKey === currentPlan && !canRenewCurrentPlan) return;

    setLoadingPlan(planKey);
    try {
      if (onSelectPlan) {
        await onSelectPlan(planKey);
      }

      setPixCode(REAL_PIX_KEY);
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        onClick={handleClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
      />

      {/* Modal Container */}
      <div className="relative bg-neutral-900 border-t sm:border border-neutral-800 rounded-t-2xl sm:rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden max-h-[92vh] sm:max-h-[90vh] flex flex-col transition-all">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-neutral-800 shrink-0 bg-neutral-900/95 backdrop-blur-md">
          <div className="flex items-center gap-3">
            {selectedPlan && !submittedSuccess ? (
              <button
                onClick={handleBackToPlans}
                type="button"
                className="bg-neutral-800 hover:bg-neutral-700 active:scale-95 text-neutral-300 p-2 rounded-xl transition-all cursor-pointer"
                title="Voltar aos planos"
              >
                <BiArrowBack className="w-5 h-5" />
              </button>
            ) : (
              <div
                className={`${
                  isTrial
                    ? "bg-sky-500/10 border-sky-500/20 text-sky-400"
                    : "bg-amber-600/10 border-amber-500/20 text-amber-500"
                } p-2 rounded-xl border`}
              >
                {isTrial ? (
                  <BiGift className="w-5 h-5" />
                ) : (
                  <BiCrown className="w-5 h-5" />
                )}
              </div>
            )}
            <div>
              <h3 className="text-neutral-50 text-base sm:text-lg font-bold">
                {submittedSuccess
                  ? "🎉 Pagamento Informado"
                  : selectedPlan
                    ? "Pagamento via PIX"
                    : isTrial
                      ? "Teste Grátis Ativo"
                      : "Planos e Assinatura"}
              </h3>
              <p className="text-neutral-400 text-xs">
                {submittedSuccess
                  ? "Aguardando confirmação bancária"
                  : selectedPlan
                    ? `Plano selecionado: ${PLAN_DETAILS[selectedPlan]?.name}`
                    : isTrial
                      ? "Aproveite 7 dias grátis ou ative seu plano definitivo"
                      : "Gerencie sua assinatura ou faça a renovação"}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            type="button"
            className="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 active:scale-95 p-2 rounded-xl transition-all cursor-pointer"
          >
            <BiCloseIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {submittedSuccess ? (
            /* TELA DE SUCESSO */
            <div className="py-6 flex flex-col items-center justify-center text-center space-y-3">
              <div className="bg-emerald-500/10 p-3.5 rounded-full border border-emerald-500/20 text-emerald-500 animate-in zoom-in-50 duration-300">
                <BiCheckCircle className="w-14 h-14" />
              </div>
              <h4 className="text-neutral-100 font-bold text-lg">
                Notificação enviada com sucesso!
              </h4>
              <p className="text-neutral-300 text-xs max-w-md leading-relaxed px-2">
                Registramos o seu aviso de pagamento. Seu acesso continuará{" "}
                <strong className="text-emerald-400">
                  100% liberado por até 48 horas
                </strong>{" "}
                enquanto confirmamos a entrada no banco.
              </p>
              <div className="pt-2 w-full max-w-xs">
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-neutral-950 font-bold py-3 rounded-xl transition-all cursor-pointer shadow-lg shadow-emerald-600/10 text-xs"
                >
                  Voltar ao Dashboard
                </button>
              </div>
            </div>
          ) : selectedPlan ? (
            /* TELA DE COBRANÇA PIX ULTRA-CLEAN E COMPACTA */
            <div className="flex flex-col space-y-3.5 py-1 max-w-md mx-auto">
              {/* Banner de Resumo */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="bg-amber-500/10 p-2 rounded-lg border border-amber-500/20 text-amber-500">
                    <BiQrScan className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">
                      Pagamento via Pix
                    </p>
                    <h4 className="text-neutral-100 font-bold text-sm">
                      {PLAN_DETAILS[selectedPlan]?.name}
                    </h4>
                  </div>
                </div>
                <span className="text-amber-500 text-base font-extrabold">
                  {formatPrice(PLAN_DETAILS[selectedPlan]?.price || 0)}
                </span>
              </div>

              {/* Box Copiar PIX */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 space-y-2">
                <label className="text-neutral-300 text-xs font-semibold flex items-center gap-1.5">
                  <span className="bg-amber-600 text-neutral-950 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold">
                    1
                  </span>
                  Copie a chave Pix abaixo:
                </label>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={pixCode}
                    className="bg-neutral-900 border border-neutral-800 text-neutral-300 text-xs rounded-lg px-2.5 py-2 w-full focus:outline-none font-mono select-all"
                  />
                  <button
                    type="button"
                    onClick={handleCopyPix}
                    className={`py-2 px-3.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                      copied
                        ? "bg-emerald-600 text-white"
                        : "bg-amber-600 hover:bg-amber-500 text-neutral-950"
                    }`}
                  >
                    {copied ? (
                      <>
                        <BiCheck className="w-4 h-4" /> Copiado
                      </>
                    ) : (
                      <>
                        <BiCopy className="w-4 h-4" /> Copiar
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Botão de Confirmação e Aviso Integrados */}
              <div className="space-y-2 pt-1">
                <label className="text-neutral-300 text-xs font-semibold flex items-center gap-1.5">
                  <span className="bg-emerald-600 text-neutral-950 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold">
                    2
                  </span>
                  Confirme seu pagamento:
                </label>

                <button
                  type="button"
                  onClick={handleConfirmPayment}
                  disabled={!copied || isSubmitting}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:border disabled:border-neutral-700/50 text-neutral-950 font-bold py-3 px-4 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 text-xs sm:text-sm shadow-md"
                >
                  {isSubmitting ? (
                    <div className="w-4 h-4 border-2 border-neutral-950/30 border-t-neutral-950 rounded-full animate-spin" />
                  ) : (
                    "Já fiz o Pix, confirmar pagamento"
                  )}
                </button>

                <p className="text-[11px] text-amber-500/90 text-center leading-tight">
                  {copied
                    ? "⚠️ Clique no botão acima para registrar seu pagamento e liberar a tolerância de 48h."
                    : "⚠️ Clique em 'Copiar' no passo 1 para liberar o botão de confirmação."}
                </p>
              </div>
            </div>
          ) : (
            /* SELEÇÃO DE PLANOS */
            <>
              {/* CARD DO PLANO ATUAL / TESTE GRÁTIS */}
              <div
                className={`bg-neutral-950 border ${
                  isTrial ? "border-sky-500/30" : "border-amber-600/30"
                } rounded-2xl p-4 sm:p-5 space-y-4 shadow-lg`}
              >
                {/* Linha Superior: Cabeçalho do Plano Atual */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800/80">
                  <div className="flex items-start gap-3">
                    <div
                      className={`${
                        isTrial
                          ? "bg-sky-500/10 border-sky-500/20 text-sky-400"
                          : "bg-amber-600/10 border-amber-500/20 text-amber-500"
                      } p-2.5 rounded-xl border shrink-0 mt-0.5`}
                    >
                      {isTrial ? (
                        <BiGift className="w-5 h-5" />
                      ) : (
                        <BiCrown className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {isTrial ? (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20">
                            Teste Grátis Ativo
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                            Seu Plano Atual
                          </span>
                        )}

                        {canRenewCurrentPlan && !isTrial && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-md">
                            Renovação Liberada
                          </span>
                        )}
                      </div>

                      <div className="flex items-baseline gap-2 mt-1">
                        <h4 className="text-neutral-100 font-bold text-base sm:text-lg">
                          {currentPlanDetails?.name || currentPlan}
                        </h4>
                        <span className="text-xs text-neutral-400 font-semibold">
                          ({formatPrice(currentPlanDetails?.price || 0)})
                        </span>
                      </div>

                      <p className="text-neutral-400 text-xs mt-0.5">
                        {isTrial
                          ? daysRemaining !== null
                            ? `Degustação: ${daysRemaining} ${
                                daysRemaining === 1
                                  ? "dia restante"
                                  : "dias restantes"
                              }`
                            : "Período de teste grátis (7 dias)"
                          : endDate
                            ? `Vence em ${endDate.toLocaleDateString("pt-BR")} (${daysRemaining} ${
                                daysRemaining === 1
                                  ? "dia restante"
                                  : "dias restantes"
                              })`
                            : "Sem data de vencimento registrada"}
                      </p>
                    </div>
                  </div>

                  {/* BOTÃO DE RENOVAÇÃO OU ATIVAÇÃO */}
                  {canRenewCurrentPlan ? (
                    <button
                      type="button"
                      onClick={() => handleChoosePlan(currentPlan)}
                      disabled={loadingPlan === currentPlan}
                      className="w-full sm:w-auto bg-amber-600 hover:bg-amber-500 active:scale-95 text-neutral-950 font-bold px-4 py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shrink-0"
                    >
                      {loadingPlan === currentPlan ? (
                        <div className="w-4 h-4 border-2 border-neutral-950/30 border-t-neutral-950 rounded-full animate-spin" />
                      ) : (
                        <>
                          <BiRefresh className="w-4 h-4" />{" "}
                          {isTrial
                            ? "Ativar Assinatura"
                            : "Renovar Plano Atual"}
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="text-left sm:text-right">
                      <span className="inline-flex items-center gap-1 text-xs text-neutral-400 bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-xl">
                        <BiCheckShield className="w-4 h-4 text-emerald-500" />{" "}
                        Plano Ativo
                      </span>
                    </div>
                  )}
                </div>

                {/* RECURSOS E BENEFÍCIOS INCLUSOS NO PLANO ATUAL */}
                {currentPlanDetails?.features &&
                  currentPlanDetails.features.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                        Recursos inclusos no seu plano:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-neutral-900/60 p-3 rounded-xl border border-neutral-800/80">
                        {currentPlanDetails.features.map((feature, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 text-xs text-neutral-200"
                          >
                            <BiCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="leading-tight">{feature}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Nota do rodapé do card */}
                {isTrial ? (
                  <p className="text-[11px] text-sky-400/90 flex items-center gap-1 pt-1 border-t border-neutral-900">
                    <BiInfoCircle className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    Você está no período de teste grátis de 7 dias. Ative sua
                    assinatura a qualquer momento para garantir acesso contínuo.
                  </p>
                ) : !canRenewCurrentPlan ? (
                  <p className="text-[11px] text-neutral-500 flex items-center gap-1 pt-1 border-t border-neutral-900">
                    <BiInfoCircle className="w-3.5 h-3.5 text-amber-500/70 shrink-0" />
                    A renovação deste plano ficará disponível 10 dias antes da
                    data de vencimento.
                  </p>
                ) : null}
              </div>

              {/* OUTROS PLANOS DISPONÍVEIS */}
              {otherPlans.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h5 className="text-neutral-300 text-xs font-bold uppercase tracking-wider">
                    Outros Planos Disponíveis
                  </h5>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {otherPlans.map((planKey) => {
                      const plan: PlanDetail = PLAN_DETAILS[planKey];
                      const isPopular = plan.popular;
                      const isLoading = loadingPlan === planKey;

                      return (
                        <div
                          key={planKey}
                          className={`relative flex flex-col justify-between rounded-2xl p-4 border transition-all ${
                            isPopular
                              ? "bg-neutral-800/60 border-amber-500/30 hover:border-amber-500/50"
                              : "bg-neutral-800/40 border-neutral-800 hover:border-neutral-700"
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between mb-3 gap-2">
                              {isPopular ? (
                                <span className="bg-neutral-800 text-amber-400 border border-amber-500/30 font-bold text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full flex items-center gap-1">
                                  <BiStar className="w-3.5 h-3.5" /> Mais
                                  Popular
                                </span>
                              ) : (
                                <div />
                              )}
                            </div>

                            <div className="text-center pb-4 border-b border-neutral-800 mb-4">
                              <h4 className="text-neutral-100 font-bold text-lg">
                                {plan.name}
                              </h4>
                              <p className="text-neutral-400 text-xs mt-1 min-h-[32px]">
                                {plan.description}
                              </p>
                              <div className="mt-2">
                                <span className="text-2xl font-black text-neutral-50">
                                  {formatPrice(plan.price)}
                                </span>
                              </div>
                            </div>

                            <div className="bg-neutral-950/60 rounded-xl p-2.5 text-center mb-4 border border-neutral-800/80">
                              <p className="text-neutral-300 text-xs font-medium">
                                Até{" "}
                                <strong className="text-amber-500 font-bold">
                                  {plan.maxBarbers}
                                </strong>{" "}
                                {plan.maxBarbers === 1
                                  ? "barbeiro"
                                  : "barbeiros"}
                              </p>
                            </div>

                            <ul className="space-y-2 mb-5 text-neutral-300">
                              {plan.features.map((feature, idx) => (
                                <li
                                  key={idx}
                                  className="flex items-start gap-2 text-xs"
                                >
                                  <BiCheck className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                  <span className="leading-tight">
                                    {feature}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => handleChoosePlan(planKey)}
                            className="w-full min-h-[44px] py-3 px-4 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 active:scale-[0.98] bg-amber-600 hover:bg-amber-500 text-neutral-950 cursor-pointer shadow-lg shadow-amber-600/10"
                          >
                            {isLoading ? (
                              <div className="w-5 h-5 border-2 border-neutral-950/30 border-t-neutral-950 rounded-full animate-spin" />
                            ) : (
                              `Migrar para o ${plan.name}`
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-900/95 backdrop-blur-md flex justify-between items-center shrink-0">
          {selectedPlan && !submittedSuccess ? (
            <button
              onClick={handleBackToPlans}
              type="button"
              className="text-neutral-400 hover:text-neutral-200 text-xs font-medium flex items-center gap-1 active:scale-95 transition-all p-1 cursor-pointer"
            >
              <BiArrowBack className="w-4 h-4" /> Mudar de plano
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={handleClose}
            type="button"
            className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl px-5 py-2.5 text-xs font-semibold cursor-pointer transition-all active:scale-95"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
