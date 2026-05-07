import { PlanType } from "@prisma/client";
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
  showPasswordOne: boolean;
  setShowPasswordOne: (val: boolean) => void;
  showPasswordTwo: boolean;
  setShowPasswordTwo: (val: boolean) => void;
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
  openingTime: string;
  setOpeningTime: Dispatch<SetStateAction<string>>;
  closingTime: string;
  setClosingTime: Dispatch<SetStateAction<string>>;
  isClosedSunday: boolean;
  setIsClosedSunday: Dispatch<SetStateAction<boolean>>;
  openingSunday: string;
  setOpeningSunday: Dispatch<SetStateAction<string>>;
  closingSunday: string;
  setClosingSunday: Dispatch<SetStateAction<string>>;
  hasDayOff: boolean;
  setHasDayOff: Dispatch<SetStateAction<boolean>>;
  dayOff: string;
  setDayOff: Dispatch<SetStateAction<string>>;
  hasLunchBreak: boolean;
  setHasLunchBreak: Dispatch<SetStateAction<boolean>>;
  lunchStart: string;
  setLunchStart: Dispatch<SetStateAction<string>>;
  lunchEnd: string;
  setLunchEnd: Dispatch<SetStateAction<string>>;
  onBack: () => void;
  handleGoToStepFour: (e: React.FormEvent) => void;
  error: string;
  setCurrentStep: Dispatch<SetStateAction<number>>;
  setError: Dispatch<SetStateAction<string>>;
}

export interface StepFourPricingProps {
  selectedPlan: "BRONZE" | "SILVER";
  setSelectedPlan: (plan: "BRONZE" | "SILVER") => void;
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
  onOpenUpgradeModal: () => void;
  currentPlan: PlanType;
}

export interface ShopSettings {
  id: number;
  name: string;
  openingTime: string;
  closingTime: string;
  hasDayOff: boolean;
  dayOff: string | null;
  isClosedSunday: boolean;
  openingSunday: string | null;
  closingSunday: string | null;
  hasLunchBreak: boolean;
  lunchStart: string | null;
  lunchEnd: string | null;
  services: Service[];
}

export interface SettingsPayload {
  services: Service[];
  openingTime: string;
  closingTime: string;
  hasDayOff: boolean;
  dayOff: string | null;
  isClosedSunday: boolean;
  openingSunday: string | null;
  closingSunday: string | null;
  hasLunchBreak: boolean;
  lunchStart: string | null;
  lunchEnd: string | null;
}

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  shop: ShopSettings;
  services: Service[];
  onSave: (payload: SettingsPayload) => void;
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
  shopInstance: string;
  shopPhone: string;
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
  plan: "BRONZE" | "SILVER";
  openingTime: string;
  closingTime: string;
  isClosedSunday: boolean;
  openingSunday?: string | null;
  closingSunday?: string | null;
  hasDayOff: boolean;
  dayOff?: string | null;
  hasLunchBreak: boolean;
  lunchStart?: string | null;
  lunchEnd?: string | null;
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
    shop: ShopSettings & {
      phone: string;
      slug: string;
      plan: PlanType;
      whatsappInstance: string;
      closedDays: { date: string; reason: string }[];
      createdAt: Date;
    };
  };
}
