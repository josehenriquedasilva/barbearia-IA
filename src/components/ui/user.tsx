import { UserProps } from "@/types/types";
import { CiSettings } from "react-icons/ci";
import { FaUsers } from "react-icons/fa";

export default function User({
  user,
  isAdmin,
  setMenu,
  isSettingOpen,
}: UserProps) {
  const handleToggleMenu = () => {
    setMenu((prev) => !prev);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-4">
        <div className="relative flex items-center justify-center w-14 h-14 rounded-xl bg-linear-to-br from-amber-500 to-amber-700 text-neutral-950 font-bold text-xl shadow-lg shadow-amber-900/20">
          {getInitials(user?.name || "U")}

          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-neutral-900 rounded-full shadow-sm"></div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {isAdmin && (
          <button
            onClick={isSettingOpen}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-neutral-950 rounded-lg px-4 py-2 transition-colors text-sm cursor-pointer md:text-base"
            title="Configurações"
          >
            <CiSettings className="w-5 h-5 md:w-6 md:h-6" />
            <span>Serviços</span>
          </button>
        )}
        {isAdmin && (
          <button
            onClick={handleToggleMenu}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-neutral-950 rounded-lg px-4 py-2 transition-colors text-sm cursor-pointer md:text-base"
          >
            <FaUsers className="w-4 h-4 md:w-5 md:h-5" />
            <span>Barbeiros</span>
          </button>
        )}
      </div>
    </div>
  );
}
