import { useState } from "react";
import { BiChevronLeft, BiChevronRight } from "react-icons/bi";

interface MiniCalendarProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}

export default function Calendar({
  selectedDate,
  onSelectDate,
}: MiniCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const daysInMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    0
  ).getDate();

  const firstDayOfMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth(),
    1
  ).getDay();

  const monthName = currentMonth.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const previousMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1)
    );
  };

  const nextMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1)
    );
  };

  const isToday = (day: number) => {
    const today = new Date();
    return (
      day === today.getDate() &&
      currentMonth.getMonth() === today.getMonth() &&
      currentMonth.getFullYear() === today.getFullYear()
    );
  };

  const isSelected = (day: number) => {
    return (
      day === selectedDate.getDate() &&
      currentMonth.getMonth() === selectedDate.getMonth() &&
      currentMonth.getFullYear() === selectedDate.getFullYear()
    );
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 md:p-6">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-neutral-50 capitalize text-sm md:text-base">
            {monthName}
          </h3>
          <div className="flex gap-2">
            <button
              onClick={previousMonth}
              className="p-1 hover:bg-neutral-800 rounded transition-colors"
            >
              <BiChevronLeft className="w-4 h-4 md:w-5 md:h-5 text-neutral-400" />
            </button>
            <button
              onClick={nextMonth}
              className="p-1 hover:bg-neutral-800 rounded transition-colors"
            >
              <BiChevronRight className="w-4 h-4 md:w-5 md:h-5 text-neutral-400" />
            </button>
          </div>
        </div>

        {/* Days of week */}
        <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
            <div key={day} className="text-center text-xs text-neutral-500">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar days */}
        <div className="grid grid-cols-7 gap-1 md:gap-2">
          {Array.from({ length: firstDayOfMonth }).map((_, index) => (
            <div key={`empty-${index}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, index) => {
            const day = index + 1;
            return (
              <button
                key={day}
                onClick={() =>
                  onSelectDate(
                    new Date(
                      currentMonth.getFullYear(),
                      currentMonth.getMonth(),
                      day
                    )
                  )
                }
                className={`
                  aspect-square flex items-center justify-center rounded-lg text-xs md:text-sm transition-all
                  ${
                    isSelected(day)
                      ? "bg-amber-600 text-neutral-950"
                      : isToday(day)
                      ? "bg-neutral-800 text-amber-500"
                      : "text-neutral-300 hover:bg-neutral-800"
                  }
                `}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="pt-4 border-t border-neutral-800 space-y-2">
        <div className="flex items-center gap-2 text-xs md:text-sm">
          <div className="w-3 h-3 md:w-4 md:h-4 bg-amber-600 rounded"></div>
          <span className="text-neutral-400">Data selecionada</span>
        </div>
        <div className="flex items-center gap-2 text-xs md:text-sm">
          <div className="w-3 h-3 md:w-4 md:h-4 bg-neutral-800 rounded"></div>
          <span className="text-neutral-400">Hoje</span>
        </div>
      </div>
    </div>
  );
}
