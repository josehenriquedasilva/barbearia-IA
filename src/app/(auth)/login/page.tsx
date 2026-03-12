"use client";

import Link from "next/link";
import React, { useState } from "react";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { RiScissorsFill } from "react-icons/ri";
import { BiLogIn } from "react-icons/bi";
import { loginAction } from "./actions";
import { useRouter } from "next/navigation";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Por favor, preencha o email");
      return;
    }

    if (password.length < 6) {
      setError("A senha deve ter no mínimo 6 caracteres");
      return;
    }

    setIsLoading(true);

    try {
      const result = await loginAction({ email, password });

      if (result.success) {
        router.push(`/dashboard/${result.user?.id}`);
      } else {
        setError(result.error || "Usuário ou senha inválidos!");
        setIsLoading(false);
      }
    } catch (error) {
      setError(`Erro ao fazer login: ${error}`);
      setIsLoading(false);
    } finally {
      setIsLoading(false);
    }
  };

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
          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div>
              <label htmlFor="username">Email</label>
              <input
                className="w-full bg-neutral-800 border border-neutral-700 text-neutral-100 rounded-lg mt-1.5 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent transition-all placeholder:text-neutral-500"
                type="email"
                id="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Digite seu email"
              />
            </div>

            <div className="relative">
              <label htmlFor="password">Senha</label>
              <input
                className="w-full bg-neutral-800 border border-neutral-700 text-neutral-100 rounded-lg mt-1.5 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent transition-all placeholder:text-neutral-500"
                type={showPassword ? "text" : "password"}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite sua senha"
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

            {error && (
              <div className="bg-red-900/20 border border-red-800 text-red-400 rounded-lg px-4 py-3 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-amber-800 disabled:cursor-not-allowed text-neutral-950 rounded-lg px-4 py-3 transition-colors flex items-center justify-center gap-2 font-semibold cursor-pointer"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-neutral-950/30 border-t-neutral-950 rounded-full animate-spin"></div>
                  <span>Entrando...</span>
                </>
              ) : (
                <>
                  <BiLogIn className="w-5 h-5" />
                  <span>Entrar</span>
                </>
              )}
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
