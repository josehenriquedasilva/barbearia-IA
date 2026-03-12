import { StepTwoProps } from "@/types/types";
import { BsArrowLeft, BsArrowRight } from "react-icons/bs";

export default function StepTwoAdimin({
  adminName,
  setAdminName,
  email,
  setEmail,
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  onNext,
  onBack,
  error,
}: StepTwoProps) {
  return (
    <form onSubmit={onNext} className="space-y-5">
      <div>
        <label htmlFor="adminName" className="block text-neutral-300 mb-2">
          Nome do Responsável
        </label>
        <input
          id="adminName"
          type="text"
          value={adminName}
          onChange={(e) => setAdminName(e.target.value)}
          className="w-full bg-neutral-800 border border-neutral-700 text-neutral-100 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent transition-all placeholder:text-neutral-500"
          placeholder="Digite seu nome completo"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-neutral-300 mb-2">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-neutral-800 border border-neutral-700 text-neutral-100 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent transition-all placeholder:text-neutral-500"
          placeholder="seu@email.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-neutral-300 mb-2">
          Senha
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-neutral-800 border border-neutral-700 text-neutral-100 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent transition-all placeholder:text-neutral-500"
          placeholder="Mínimo 6 caracteres"
        />
      </div>

      <div>
        <label
          htmlFor="confirmPassword"
          className="block text-neutral-300 mb-2"
        >
          Confirmar Senha
        </label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full bg-neutral-800 border border-neutral-700 text-neutral-100 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent transition-all placeholder:text-neutral-500"
          placeholder="Digite a senha novamente"
        />
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-400 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => {
            onBack();
          }}
          className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg px-4 py-3 transition-colors flex items-center justify-center font-medium gap-2 cursor-pointer"
        >
          <BsArrowLeft className="w-5 h-5" />
          <span>Voltar</span>
        </button>

        <button
          type="submit"
          className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-800 disabled:cursor-not-allowed text-neutral-950 rounded-lg px-4 md:py-3 transition-colors flex items-center justify-center gap-2 font-medium cursor-pointer"
        >
          <span>Próxima Etapa</span>
          <BsArrowRight className="w-5 h-5" />
        </button>
      </div>
    </form>
  );
}
