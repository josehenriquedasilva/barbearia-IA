import { Dispatch, SetStateAction } from "react";

export interface UserData {
  id: number;
  name: string;
}

export interface BarbersData {
  id: number;
  name: string;
  email: string;
  role: "BARBER" | "ADMIN";
}

export interface UserProps {
  user?: {
    id: number;
    name: string;
  };
  isAdmin: boolean;
  setMenu: React.Dispatch<React.SetStateAction<boolean>>;
  isSettingOpen: () => void;
}

export interface CalendarProps {
  isAdmin: boolean;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  isOpenClosedDaysModal: () => void;
  closedDays: string[];
}

export interface StepOneProps {
  barberName: string;
  setBarberName: (val: string) => void;
  phone: string;
  handlePhoneChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onNext: (e: React.FormEvent) => void;
  error: string;
}

export interface StepTwoProps {
  adminName: string;
  setAdminName: (val: string) => void;
  email: string;
  setEmail: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  confirmPassword: string;
  setConfirmPassword: (val: string) => void;
  onNext: (e: React.FormEvent) => void;
  onBack: () => void;
  error: string;
}

interface ServiceFormState {
  name: string;
  price: string;
  duration: string;
}

interface ServiceErrorsState {
  name: string;
  price: string;
  duration: string;
}

export interface StepThreeProps {
  services: Service[];
  isAddingService: boolean;
  setIsAddingService: Dispatch<SetStateAction<boolean>>;
  serviceForm: ServiceFormState;
  setServiceForm: Dispatch<SetStateAction<ServiceFormState>>;
  serviceErrors: ServiceErrorsState;
  setServiceErrors: Dispatch<SetStateAction<ServiceErrorsState>>;
  handleAddOrEditService: () => void;
  handleDeleteService: (id: number) => void;
  handleEditService: (service: Service) => void;
  handleCancelServiceForm: () => void;
  onBack: () => void;
  handleGoToStepFour: (e: React.FormEvent) => void;
  error: string;
  setCurrentStep: Dispatch<SetStateAction<number>>;
  setError: Dispatch<SetStateAction<string>>;
}

export interface StepFourPricingProps {
  selectedPlan: string | null;
  setSelectedPlan: (plan: string) => void;
  onBack: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  error: string;
}

export interface Service {
  id: number;
  name: string;
  price: number;
  duration: number;
}

export interface MobileMenuProps {
  barbers: BarbersData[];
  isAdmin: boolean;
  menuOpen: boolean;
  menuClose: () => void;
  baberModalOpen: () => void;
  setViewBarberId: (id: number) => void;
  setViewBarberName: (name: string) => void;
  setMenu: Dispatch<SetStateAction<boolean>>;
  viewBarberId: number;
}

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  services: Service[];
  onSave: (updatedServices: Service[]) => void;
}

export interface ClosedDaysModalProps {
  isOpen: boolean;
  onClose: () => void;
  closedDays: { date: string; reason: string }[];
  onSave: (days: { date: string; reason: string }[]) => Promise<void>;
}

export interface AppointmentData {
  id: number;
  clientName: string;
  clientPhone: string;
  service: {
    name: string;
    durationMinutes: string;
    price: number;
  };
  startTime: string;
  endTime: string;
  status: string;
}

export interface InfoAppointmentsProps {
  appointments: AppointmentData[];
}

export interface AppointmentsListProps {
  appointments: AppointmentData[];
  onOpenCancelModal: (appointment: AppointmentData) => void;
}

export interface AppointmentCardProps {
  appointment: AppointmentData;
  onOpenCancelModal?: (appointment: AppointmentData) => void;
}

export interface FormBarberProps {
  barberName: string;
  phone: string;
  adminName: string;
  email: string;
  password: string;
  services: Service[];
  plan: "bronze" | "silver";
}

export interface FormLoginProps {
  email: string;
  password: string;
}

export interface DashboardViewProps {
  isAdmin: boolean;
  user: {
    id: number;
    name: string;
    email: string;
    role: "ADMIN" | "BARBER" | string;
    shopId: number;
    shop: {
      id: number;
      name: string;
      phone: string;
      slug: string;
      closedDays: { date: string; reason: string }[];
      createdAt: Date;
      services: Service[];
    };
  };
}
