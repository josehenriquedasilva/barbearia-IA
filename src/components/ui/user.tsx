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

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex gap-3">
        <span className="bg-neutral-500 p-3 rounded-md">Imagen</span>
        <div>
          <h1 className="text-lg font-serif">{user?.name}</h1>
          <p className="text-sm text-neutral-300">Barbeiro Profissional</p>
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
