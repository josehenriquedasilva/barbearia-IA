import { BiUser } from "react-icons/bi";
import { CgClose } from "react-icons/cg";

interface MobileMenuProps {
  setMenu: (value: boolean) => void;
}

export default function MobileMenu({ setMenu }: MobileMenuProps) {
  return (
    <div>
      <div className="flex items-center justify-between p-4 border-b border-neutral-800">
        <div className="flex items-center gap-2 text-neutral-300">
          <BiUser className="w-5 h-5" />
          <span className="uppercase tracking-wide">Barbeiros</span>
        </div>
        <button
          onClick={() => setMenu(false)}
          className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
        >
          <CgClose className="w-5 h-5 text-neutral-400" />
        </button>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        <button
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all bg-amber-600 text-neutral-950"`}
        >
          <span className="text-2xl">👨🏻</span>
          <span>Roberto Simão</span>
        </button>
        <button
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-neutral-300 hover:bg-neutral-800"`}
        >
          <span className="text-2xl">👨🏽</span>
          <span>Pedro Costa</span>
        </button>
        <button
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-neutral-300 hover:bg-neutral-800"`}
        >
          <span className="text-2xl">👨🏾</span>
          <span>José Santos</span>
        </button>
      </nav>
    </div>
  );
}
