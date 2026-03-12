import { BarbersData, MobileMenuProps } from "@/types/types";
import { useEffect } from "react";
import { BiUser, BiUserPlus } from "react-icons/bi";
import { CgClose } from "react-icons/cg";
import { FaUsers } from "react-icons/fa";

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
          <div className="flex items-center justify-between p-4 border-b border-neutral-800">
            <div className="flex items-center gap-2 text-neutral-300">
              <FaUsers className="w-5 h-5" />
              <span className="uppercase tracking-wide">Barbeiros</span>
            </div>
            <button
              onClick={menuClose}
              className="p-2 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
            >
              <CgClose className="w-5 h-5 text-neutral-400" />
            </button>
          </div>

          <nav className="flex-1 p-4 space-y-2">
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

          {isAdmin && (
            <div className="p-4 border-t border-neutral-800">
              <button
                onClick={baberModalOpen}
                className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-neutral-950 rounded-lg px-4 py-3 transition-colors cursor-pointer"
              >
                <BiUserPlus className="w-5 h-5" />
                <span>Adicionar Barbeiro</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
