import Link from "next/link";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { RiScissorsFill } from "react-icons/ri";

export default function Login() {
  return (
    <div className="bg-neutral-950 min-h-screen flex items-center justify-center p-4 text-gray-50">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-5">
          <RiScissorsFill className="bg-amber-600 text-black p-3 rounded-xl size-20 mb-4" />
          <h1 className="text-neutral-50 text-3xl mb-2">BarberPro Dashboard</h1>
          <p className="text-neutral-400">
            Entre com suas credenciais de barbeiro
          </p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 md:p-8">
          <form action="" className="flex flex-col gap-5">
            <div>
              <label htmlFor="username">Usuário</label>
              <input
                className="w-full bg-neutral-800 border border-neutral-700 text-neutral-100 rounded-lg mt-1.5 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent transition-all placeholder:text-neutral-500"
                required
                type="text"
                id="username"
                placeholder="Digite seu usuário"
              />
            </div>

            <div className="relative">
              <label htmlFor="password">Senha</label>
              <input
                className="w-full bg-neutral-800 border border-neutral-700 text-neutral-100 rounded-lg mt-1.5 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent transition-all placeholder:text-neutral-500"
                required
                type="password"
                id="password"
                placeholder="Digite sua senha"
              />
              <button
                type="button"
                className="absolute right-4 bottom-4 text-neutral-400 hover:text-neutral-300 transition-colors cursor-pointer"
              >
                <FiEyeOff className="w-5 h-5" />
                {/*<FiEye className="w-5 h-5"/>*/}
              </button>
            </div>

            {/* MENSAGEM DE "ERRO"!
            <div className="bg-red-900/20 border border-red-800 text-red-400 rounded-lg px-4 py-3 text-sm">
              <p>Usuário ou senha inválidos!</p>
            </div>
            */}

            <button
              type="submit"
              className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-amber-800 disabled:cursor-not-allowed text-neutral-950 rounded-lg px-4 py-3 transition-colors flex items-center justify-center gap-2 font-semibold cursor-pointer"
            >
              Entrar
            </button>
            <div className="text-center">
              <span className="w-full text-neutral-400 text-sm transition-colors flex justify-center gap-1">
                Não tem uma conta?
                <Link
                  href={"/register"}
                  className="text-amber-500 hover:text-amber-600 transition-colors"
                >
                  Cadastre sua barbearia
                </Link>
              </span>
            </div>
          </form>
        </div>
        <p className="text-center text-neutral-500 text-sm mt-6">
          BarberPro © 2026 - Sistema de Gerenciamento
        </p>
      </div>
    </div>
  );
}
