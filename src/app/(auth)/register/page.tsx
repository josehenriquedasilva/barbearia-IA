"use client";

import Link from "next/link";
import { useState } from "react";
import { BiArrowToRight, BiCheck } from "react-icons/bi";
import { BsArrowLeft } from "react-icons/bs";
import { RiScissorsFill } from "react-icons/ri";

export default function Register() {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Dados da Etapa 1
  const [barberName, setBarberName] = useState("");
  const [phone, setPhone] = useState("");

  // Dados da Etapa 2
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, "").slice(0, 11);
    if (numbers.length <= 2) {
      return numbers.replace(/^(\d{2})/, "($1");
    }
    if (numbers.length <= 6) {
      return numbers.replace(/^(\d{2})(\d)/, "($1) $2");
    }
    if (numbers.length <= 10) {
      return numbers.replace(/^(\d{2})(\d{4})(\d)/, "($1) $2-$3");
    }
    return numbers.replace(/^(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setPhone(formatted);
  };

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const rawPhone = phone.replace(/\D/g, "");

    if (currentStep === 1) {
      if (!barberName.trim()) {
        setError("Por favor, preencha o nome da barbearia");
        return;
      }
      if (rawPhone === "") {
        setError("Por favor, preencha o telefone");
        return;
      } else if (rawPhone.length < 11) {
        setError("Número de telefone inválido");
        return;
      }
      setCurrentStep(2);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!adminName.trim()) {
      setError("Por favor, preencha o nome do responsável");
      return;
    }
    if (!email.trim()) {
      setError("Por favor, preencha o email");
      return;
    }
    if (!email.includes("@")) {
      setError("Email inválido");
      return;
    }
    if (password.length < 6) {
      setError("A senha deve ter no mínimo 6 caracteres");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem");
      return;
    }
  };

  return (
    <div className="bg-neutral-950 min-h-screen flex items-center justify-center p-4 text-gray-50">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-5">
          <RiScissorsFill className="bg-amber-600 text-black p-3 rounded-xl size-20 mb-4" />
          <h1 className="text-neutral-50 text-3xl mb-2">BarberPro Dashboard</h1>
          <p className="text-neutral-400">Crie sua conta no BarberPro</p>
        </div>
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-neutral-400">
              Etapa {currentStep} de 2
            </span>
            <span className="text-sm text-amber-500">
              {currentStep === 1
                ? "Dados da Barbearia"
                : "Dados do Responsável"}
            </span>
          </div>
          <div className="w-full bg-neutral-800 rounded-full h-2">
            <div
              className="bg-amber-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(currentStep / 2) * 100}%` }}
            />
          </div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 md:p-8">
          {currentStep === 1 && (
            <form onSubmit={handleNextStep} className="flex flex-col gap-5">
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
          )}
          {currentStep === 2 && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="adminName"
                  className="block text-neutral-300 mb-2"
                >
                  Nome do Responsável
                </label>
                <input
                  id="adminName"
                  type="text"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 text-neutral-100 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent transition-all placeholder:text-neutral-500"
                  placeholder="Digite seu nome completo"
                  required
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
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-neutral-300 mb-2"
                >
                  Senha
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 text-neutral-100 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent transition-all placeholder:text-neutral-500"
                  placeholder="Mínimo 6 caracteres"
                  required
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
                  required
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
                    setCurrentStep(1);
                    setError("");
                  }}
                  className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg px-4 py-3 transition-colors flex items-center justify-center gap-2"
                >
                  <BsArrowLeft className="w-5 h-5" />
                  <span>Voltar</span>
                </button>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-800 disabled:cursor-not-allowed text-neutral-950 rounded-lg px-4 py-3 transition-colors flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-neutral-950/30 border-t-neutral-950 rounded-full animate-spin"></div>
                      <span>Cadastrando...</span>
                    </>
                  ) : (
                    <>
                      <BiCheck className="w-5 h-5" />
                      <span>Finalizar</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
        <p className="text-center text-neutral-500 text-sm mt-6">
          BarberPro © 2026 - Sistema de Gerenciamento
        </p>
      </div>
    </div>
  );
}
