import { StepOneProps } from "@/types/types";
import Link from "next/link";
import { BiArrowToRight } from "react-icons/bi";

export default function StepOneShop({
  barberName,
  setBarberName,
  phone,
  handlePhoneChange,
  onNext,
  error,
}: StepOneProps) {
  return (
    <form className="flex flex-col gap-5" onSubmit={onNext}>
      <div>
        <label htmlFor="barberName">Nome da Barbearia</label>
        <input
          className="w-full bg-neutral-800 border border-neutral-700 text-neutral-100 rounded-lg mt-1.5 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent transition-all placeholder:text-neutral-500"
          type="text"
          id="barberName"
          value={barberName}
          onChange={(e) => setBarberName(e.target.value)}
          placeholder="Ex: Barber Shop"
        />
      </div>

      <div className="relative">
        <label htmlFor="phone">Telefone</label>
        <input
          className="w-full bg-neutral-800 border border-neutral-700 text-neutral-100 rounded-lg mt-1.5 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent transition-all placeholder:text-neutral-500"
          type="tel"
          id="phone"
          value={phone}
          onChange={handlePhoneChange}
          placeholder="(81) 98765-4321"
        />
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-400 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-amber-800 disabled:cursor-not-allowed text-neutral-950 rounded-lg px-4 py-3 transition-colors flex items-center justify-center gap-1 font-semibold cursor-pointer"
      >
        Próxima Etapa <BiArrowToRight className="size-5" />
      </button>
      <div className="text-center">
        <span className="w-full text-neutral-400 text-sm transition-colors flex justify-center gap-1">
          Já tem uma conta?
          <Link
            href={"/login"}
            className="text-amber-500 hover:text-amber-600 transition-colors"
          >
            Faça login
          </Link>
        </span>
      </div>
    </form>
  );
}
