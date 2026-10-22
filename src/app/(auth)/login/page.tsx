"use client";

import Link from "next/link";
import Image from "next/image";
import React, { useState, useEffect } from "react";
import { FiEye, FiEyeOff } from "react-icons/fi";

import { loginAction } from "./actions";
import { useRouter } from "next/navigation";
import { BiLogIn } from "react-icons/bi";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(5);
  const [lockoutTime, setLockoutTime] = useState(0);

  const router = useRouter();

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (lockoutTime > 0) {
      timer = setInterval(() => {
        setLockoutTime((prev) => prev - 1);
      }, 1000);
    } else if (lockoutTime === 0 && failedAttempts >= 5) {
      setFailedAttempts(0);
      setError("");
    }
    return () => clearInterval(timer);
  }, [lockoutTime, failedAttempts]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (lockoutTime > 0) {
      return;
    }

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
        setFailedAttempts(0);
        router.push(`/dashboard/${result.user?.id}`);
      } else {
        const nextAttempts = failedAttempts + 1;
        setFailedAttempts(nextAttempts);

        if (nextAttempts >= 5) {
          setLockoutTime(60);
          setError(
            "Muitas tentativas incorretas. Aguarde 60 segundos para tentar novamente.",
          );
        } else {
          setError(
            result.error ||
              `Usuário ou senha inválidos! (${5 - nextAttempts} tentativas restantes)`,
          );
        }
        setIsLoading(false);
      }
    } catch (err) {
      setError(
        `Erro ao fazer login. Atualize a página e tente novamente. ${err}`,
      );
      setIsLoading(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-neutral-950 min-h-screen flex items-center justify-center p-4 text-gray-50">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-5">
          <div className="relative w-20 h-20 mb-4 flex items-center justify-center">
            <Image
              src="/logo.png"
              alt="BarberPro Logo"
              width={80}
              height={80}
              className="object-contain w-full h-full drop-shadow-md rounded-2xl"
              priority
            />
          </div>
          <h1 className="text-neutral-50 text-3xl mb-2">BarberPro</h1>
          <p className="text-neutral-400">
            Entre com suas credenciais de barbeiro
          </p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 md:p-8">
          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div>
              <label htmlFor="username">Email</label>
              <input
                className="w-full bg-neutral-800 border border-neutral-700 text-neutral-100 rounded-lg mt-1.5 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent transition-all placeholder:text-neutral-500 disabled:opacity-50"
                type="email"
                id="username"
                value={email}
                maxLength={100}
                disabled={lockoutTime > 0}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Digite seu email"
              />
            </div>

            <div className="relative">
              <label htmlFor="password">Senha</label>
              <input
                className="w-full bg-neutral-800 border border-neutral-700 text-neutral-100 rounded-lg mt-1.5 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent transition-all placeholder:text-neutral-500 disabled:opacity-50"
                type={showPassword ? "text" : "password"}
                id="password"
                value={password}
                maxLength={72}
                disabled={lockoutTime > 0}
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
              disabled={isLoading || lockoutTime > 0}
              className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-amber-800/50 disabled:cursor-not-allowed text-neutral-950 rounded-lg px-4 py-3 transition-colors flex items-center justify-center gap-2 font-semibold cursor-pointer"
            >
              {lockoutTime > 0 ? (
                <span>Aguarde {lockoutTime}s...</span>
              ) : isLoading ? (
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

          <div className="mt-6 pt-4 border-t border-neutral-800 text-center text-xs text-neutral-500">
            Ao entrar, você concorda com nossos{" "}
            <Link
              href="/terms"
              target="_blank"
              className="text-amber-500 hover:underline"
            >
              Termos de Uso
            </Link>{" "}
            e{" "}
            <Link
              href="/privacy"
              target="_blank"
              className="text-amber-500 hover:underline"
            >
              Política de Privacidade
            </Link>
            .
          </div>
        </div>
        <p className="text-center text-neutral-500 text-sm mt-6">
          BarberPro © 2026 - Sistema de Gerenciamento
        </p>
      </div>
    </div>
  );
}
