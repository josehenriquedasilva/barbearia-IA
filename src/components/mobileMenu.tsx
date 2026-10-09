import { BarbersData, MobileMenuProps } from "@/types/types";
import { PlanType } from "@prisma/client";
import { useEffect } from "react";
import { BiCrown, BiHelpCircle, BiUser, BiUserPlus } from "react-icons/bi";
import { CgClose, CgMail } from "react-icons/cg";
import { FaUsers, FaWhatsapp } from "react-icons/fa";

const SUPPORT_WHATSAPP = "5581981923574";
const SUPPORT_EMAIL = "josehenrique60t@gmail.com";

export default function MobileMenu({
  barbers,
  isAdmin,
  menuOpen,
  menuClose,
  baberModalOpen,
  setViewBarberId,
  setViewBarberName,
  setMenu,
  viewBarberId,
  plan,
  currentPlan,
  onOpenSubscriptionModal,
}: MobileMenuProps) {
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [menuOpen]);

  const handleSelectBarber = (barber: BarbersData) => {
    setViewBarberId(barber.id);
    setViewBarberName(barber.name);
    setMenu(false);
  };

  const activePlan = plan || currentPlan || PlanType.BRONZE;
  const isSilver = activePlan === PlanType.SILVER;

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${
          menuOpen
            ? "opacity-100 visible"
            : "opacity-0 invisible pointer-events-none"
        }`}
        onClick={menuClose}
      />
      <div
        className={`fixed inset-y-0 left-0 w-72 bg-neutral-900 z-50 transform transition-transform duration-300 ease-in-out border-r border-neutral-800 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header do Menu */}
          <div className="flex items-center justify-between p-4 border-b border-neutral-800">
            <div className="flex items-center gap-2 text-neutral-300">
              <FaUsers className="w-5 h-5" />
              <span className="uppercase tracking-wide font-semibold text-sm">
                Barbeiros
              </span>
            </div>
            <button
              onClick={menuClose}
              className="p-2 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
            >
              <CgClose className="w-5 h-5 text-neutral-400" />
            </button>
          </div>

          {/* Lista de Barbeiros */}
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {barbers.map((barber) => {
              const isSelected = viewBarberId === barber.id;
              if (isAdmin) {
                return (
                  <button
                    key={barber.id}
                    onClick={() => handleSelectBarber(barber)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all cursor-pointer ${
                      isSelected
                        ? "bg-amber-600 text-neutral-950 font-bold shadow-lg"
                        : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
                    }`}
                  >
                    <span className="text-2xl">
                      <BiUser className="w-5 h-5" />
                    </span>
                    <span>{barber.name}</span>
                  </button>
                );
              }

              return (
                <div
                  key={barber.id}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg ${
                    isSelected
                      ? "bg-neutral-800 border border-amber-600/50 text-neutral-100 font-medium"
                      : "bg-neutral-800/40 text-neutral-500"
                  }`}
                >
                  <span className="text-2xl opacity-80">👨🏻</span>
                  <span>{barber.name}</span>
                </div>
              );
            })}
          </nav>

          {/* Rodapé / Ações do Administrador & Suporte */}
          <div className="p-4 border-t border-neutral-800 space-y-2.5 bg-neutral-900/95">
            {isAdmin && (
              <>
                <button
                  onClick={() => {
                    menuClose();
                    baberModalOpen();
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 text-neutral-950 font-bold rounded-xl px-4 py-2.5 text-xs transition-all cursor-pointer shadow-md"
                >
                  <BiUserPlus className="w-4 h-4" />
                  <span>Adicionar Barbeiro</span>
                </button>

                {onOpenSubscriptionModal && (
                  <button
                    onClick={() => {
                      menuClose();
                      onOpenSubscriptionModal();
                    }}
                    className="w-full flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold rounded-xl px-4 py-2 text-xs transition-all cursor-pointer border border-neutral-700/60"
                  >
                    <BiCrown className="w-4 h-4 text-amber-500" />
                    <span>Meu Plano & Assinatura</span>
                  </button>
                )}
              </>
            )}

            <div className="pt-2 border-t border-neutral-800/80">
              <p className="text-[10px] uppercase font-bold text-neutral-500 mb-2 tracking-wider flex items-center gap-1">
                <BiHelpCircle className="w-3.5 h-3.5" /> Suporte do Sistema
              </p>

              {isSilver ? (
                <a
                  href={`https://wa.me/${SUPPORT_WHATSAPP}?text=Ol%C3%A1!%20Sou%20cliente%20do%20Barber-Pro%20e%20preciso%20de%20suporte.`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold rounded-xl px-4 py-2 text-xs transition-all shadow-md cursor-pointer"
                >
                  <FaWhatsapp className="w-4 h-4" />
                  <span>Suporte via WhatsApp</span>
                </a>
              ) : (
                <a
                  href={`mailto:${SUPPORT_EMAIL}?subject=Suporte%20Barber-Pro%20(Plano%20Bronze)`}
                  className="w-full flex items-center justify-center gap-2 bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 font-semibold rounded-xl px-4 py-2 text-xs transition-all border border-neutral-700/50 cursor-pointer"
                >
                  <CgMail className="w-4 h-4 text-amber-500" />
                  <span>Suporte via E-mail</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
