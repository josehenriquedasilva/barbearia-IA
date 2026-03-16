"use client";

import { useState } from "react";
import { RiScissorsFill } from "react-icons/ri";
import { registerShop } from "./actions";
import { useRouter } from "next/navigation";
import { formatPhone } from "@/utils/formatters";
import StepOneShop from "@/components/register/stepOneShop";
import StepTwoAdimin from "@/components/register/stepTwoAdmin";
import StepThreeServices from "@/components/register/stepThreeServices";
import { Service } from "@/types/types";
import StepFourPricing from "@/components/register/stepFourPricing";

export default function Register() {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  // Dados da Etapa 1
  const [barberName, setBarberName] = useState("");
  const [phone, setPhone] = useState("");

  // Dados da Etapa 2
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setPhone(formatted);
  };

  // Dados da Etapa 3
  const [services, setServices] = useState<Service[]>([]);
  const [isAddingService, setIsAddingService] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null);
  const [serviceForm, setServiceForm] = useState({
    name: "",
    price: "",
    duration: "",
  });
  const [serviceErrors, setServiceErrors] = useState({
    name: "",
    price: "",
    duration: "",
  });

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (currentStep === 1) {
      if (!barberName.trim() || phone.replace(/\D/g, "").length < 11) {
        setError("Preencha os dados da barbearia corretamente.");
        return;
      }
      setCurrentStep(2);
    }
  };

  const handleGoToStepThree = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !adminName ||
      !email.includes("@") ||
      password.length < 6 ||
      password !== confirmPassword
    ) {
      setError("Verifique os dados do responsável.");
      return;
    }
    setError("");
    setCurrentStep(3);
  };

  const handleAddOrEditService = () => {
    if (!serviceForm.name || !serviceForm.price || !serviceForm.duration) {
      setError("Preencha os campos obrigatórios do serviço.");
      return;
    }

    const priceNum = parseFloat(serviceForm.price);
    const durationNum = parseInt(serviceForm.duration);

    if (isNaN(priceNum) || isNaN(durationNum)) {
      setError("Preço e duração devem ser números válidos.");
      return;
    }

    const serviceData: Service = {
      id: editingServiceId || Date.now(),
      name: serviceForm.name,
      price: parseFloat(serviceForm.price),
      duration: parseInt(serviceForm.duration),
    };

    if (editingServiceId) {
      setServices((prev) =>
        prev.map((s) => (s.id === editingServiceId ? serviceData : s)),
      );
    } else {
      setServices((prev) => [...prev, serviceData]);
    }

    setIsAddingService(false);
    setEditingServiceId(null);
    setServiceForm({ name: "", price: "", duration: "" });
    setError("");
  };

  const handleGoToStepFour = (e: React.FormEvent) => {
    e.preventDefault();
    if (services.length === 0) {
      setError("Adicione pelo menos um serviço.");
      return;
    }
    setError("");
    setCurrentStep(4);
  };

  // Dados da Etapa 4
  const [selectedPlan, setSelectedPlan] = useState<"BRONZE" | "SILVER">("BRONZE");

  const handleFinalizeRegister = async () => {
    if (services.length === 0) {
      setError("Adicione pelo menos um serviço.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await registerShop({
        barberName,
        phone,
        adminName,
        email,
        password,
        services,
        plan: (selectedPlan as "BRONZE" | "SILVER") || "BRONZE",
      });

      if (result.success) {
        router.push("/login?register=true");
      } else {
        setError(result.error || "Erro ao cadastrar.");
      }
    } catch (err) {
      setError(`Falha na conexão. | ${err}`);
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
            Cadastre Sua Barbearia no{" "}
            <span className="font-bold">BarberPro</span>
          </p>
        </div>
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-neutral-400">
              Etapa {currentStep} de 4
            </span>
            <span className="text-sm text-amber-500">
              {currentStep === 1 && "Dados da Barbearia"}
              {currentStep === 2 && "Dados do Responsável"}
              {currentStep === 3 && "Serviços Oferecidos"}
              {currentStep === 4 && "Plano de Assinatura"}
            </span>
          </div>
          <div className="w-full bg-neutral-800 rounded-full h-2">
            <div
              className="bg-amber-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(currentStep / 4) * 100}%` }}
            />
          </div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-5 md:p-8">
          {currentStep === 1 && (
            <StepOneShop
              barberName={barberName}
              setBarberName={setBarberName}
              phone={phone}
              handlePhoneChange={handlePhoneChange}
              onNext={handleNextStep}
              error={error}
            />
          )}
          {currentStep === 2 && (
            <StepTwoAdimin
              adminName={adminName}
              setAdminName={setAdminName}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              confirmPassword={confirmPassword}
              setConfirmPassword={setConfirmPassword}
              error={error}
              onNext={handleGoToStepThree}
              onBack={() => {
                setCurrentStep(1);
                setError("");
              }}
            />
          )}
          {currentStep === 3 && (
            <StepThreeServices
              services={services}
              isAddingService={isAddingService}
              setIsAddingService={setIsAddingService}
              serviceForm={serviceForm}
              setServiceForm={setServiceForm}
              serviceErrors={serviceErrors}
              setServiceErrors={setServiceErrors}
              handleAddOrEditService={handleAddOrEditService}
              handleDeleteService={(id) =>
                setServices((prev) => prev.filter((s) => s.id !== id))
              }
              handleEditService={(service) => {
                setServiceForm({
                  name: service.name,
                  price: service.price.toString(),
                  duration: service.duration.toString(),
                });
                setEditingServiceId(service.id);
                setIsAddingService(true);
              }}
              handleCancelServiceForm={() => {
                setIsAddingService(false);
                setEditingServiceId(null);
                setServiceForm({ name: "", price: "", duration: "" });
              }}
              onBack={() => setCurrentStep(2)}
              handleGoToStepFour={handleGoToStepFour}
              error={error}
              setCurrentStep={setCurrentStep}
              setError={setError}
            />
          )}
          {currentStep === 4 && (
            <StepFourPricing
              selectedPlan={selectedPlan}
              setSelectedPlan={setSelectedPlan}
              onBack={() => setCurrentStep(3)}
              onConfirm={handleFinalizeRegister}
              isLoading={isLoading}
              error={error}
            />
          )}
        </div>
        <p className="text-center text-neutral-500 text-sm mt-6">
          BarberPro © 2026 - Sistema de Gerenciamento
        </p>
      </div>
    </div>
  );
}
