export interface UserData {
  id: number;
  name: string;
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

export interface AppointmentsListProps {
  appointments: AppointmentData[];
}

export interface AppointmentCardProps {
  appointment: AppointmentData;
}