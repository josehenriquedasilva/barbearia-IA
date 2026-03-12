export const formatPhone = (value: string) => {
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

export const formatTime = (date: string | Date) => {
  if (!date) return "";

  return new Date(date).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};
