import { useState } from "react";
import { BiLock, BiUser, BiUserPlus, BiX } from "react-icons/bi";
import { CgMail } from "react-icons/cg";
import { FiEye, FiEyeOff } from "react-icons/fi";

interface ManageBarbersModalProps {
  barberModalClose: () => void;
  onAddBarber: (data: {
    name: string;
    email: string;
    password: string;
  }) => Promise<{ success: boolean; error?: string }>;
  // Veirificar se essa tipagem "Promisse" está correta
}

export default function ManageBarbersModal({
  barberModalClose,
  onAddBarber,
}: ManageBarbersModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Usar o "setError" e o "setIsLoadin"

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const result = await onAddBarber({ name, email, password });

    if (result.success) {
      setSuccess(true);

      setName("");
      setEmail("");
      setPassword("");

      setTimeout(() => {
        barberModalClose();
      }, 2000);
    } else {
      setError(result.error || "Ocorreu um erro inesperado.");
    }
    setIsLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        onClick={barberModalClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      <div className="relative bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="bg-amber-600/10 p-2 rounded-lg">
              <BiUserPlus className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3 className="text-neutral-50 text-lg">Gerenciar Barbeiros</h3>
              <p className="text-neutral-400 text-sm">
                Cadastre um novo barbeiro
              </p>
            </div>
          </div>
          <button
            onClick={barberModalClose}
            className="text-neutral-400 hover:text-neutral-300 hover:bg-neutral-800 p-2 rounded-lg transition-colors cursor-pointer"
          >
            <BiX className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label
              htmlFor="barber-name"
              className="block text-neutral-300 mb-2"
            >
              Nome do Barbeiro
            </label>
            <div className="relative">
              <BiUser className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
              <input
                id="barber-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 text-neutral-100 rounded-lg pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent transition-all placeholder:text-neutral-500"
                placeholder="Digite o nome completo"
                required
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="barber-email"
              className="block text-neutral-300 mb-2"
            >
              Email do Barbeiro
            </label>
            <div className="relative">
              <CgMail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
              <input
                id="barber-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 text-neutral-100 rounded-lg pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent transition-all placeholder:text-neutral-500"
                placeholder="barbeiro@email.com"
                required
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="barber-password"
              className="block text-neutral-300 mb-2"
            >
              Senha de Acesso
            </label>
            <div className="relative">
              <BiLock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
              <input
                id="barber-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 text-neutral-100 rounded-lg pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent transition-all placeholder:text-neutral-500"
                placeholder="Mínimo 6 caracteres"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 bottom-4 text-neutral-400 hover:text-neutral-300 transition-colors cursor-pointer"
              >
                {showPassword ? (
                  <FiEye className="w-5 h-5" />
                ) : (
                  <FiEyeOff className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-800 text-red-400 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-900/20 border border-green-800 text-green-400 rounded-lg px-4 py-3 text-sm">
              ✅ Barbeiro cadastrado com sucesso!
            </div>
          )}

          <div className="bg-amber-600/10 border border-amber-600/20 rounded-lg px-4 py-3">
            <p className="text-amber-500 text-sm">
              O barbeiro receberá um email com as credenciais de acesso ao
              sistema.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={barberModalClose}
              type="button"
              className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg px-4 py-3 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-800 disabled:cursor-not-allowed text-neutral-950 rounded-lg px-4 py-3 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-neutral-950/30 border-t-neutral-950 rounded-full animate-spin"></div>
                  <span>Cadastrando...</span>
                </>
              ) : (
                <>
                  <BiUserPlus className="w-5 h-5" />
                  <span>Cadastrar</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
