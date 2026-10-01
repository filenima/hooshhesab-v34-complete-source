"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toJalali, toPersianDigits, toLocalISODate } from "@/lib/persian";

interface JalaliDatePickerProps {
 value?: string; // ISO date string (YYYY-MM-DD)
 onChange?: (value: string) => void;
 placeholder?: string;
 className?: string;
 id?: string;
 disabled?: boolean; // FIX(3-b): غیرفعال‌سازی (مثلاً حین submit) — قبلاً در props نبود
}

export function JalaliDatePicker({
 value,
 onChange,
 placeholder = "انتخاب تاریخ",
 className,
 id,
 disabled = false,
}: JalaliDatePickerProps) {
 const [open, setOpen] = React.useState(false);
 const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(
 value? new Date(value): undefined
 );

 React.useEffect(() => {
 if (value) {
 setSelectedDate(new Date(value));
 } else {
 setSelectedDate(undefined);
 }
 }, [value]);

 const handleSelect = (date: Date | undefined) => {
 setSelectedDate(date);
 if (date && onChange) {
 // تاریخ ISO محلی — بدون تبدیل UTC (باگ شیفت روز برای ایران +03:30)
 onChange(toLocalISODate(date));
 }
 setOpen(false);
 };

 const displayValue = selectedDate
? toJalali(selectedDate)
: placeholder;

 return (
 <Popover open={disabled? false: open} onOpenChange={disabled? undefined: setOpen}>
 <PopoverTrigger asChild>
 <Button
 id={id}
 type="button"
 variant="outline"
 disabled={disabled}
 className={cn(
 "w-full justify-start text-right font-normal h-9",
!selectedDate && "text-muted-foreground",
 className
 )}
 >
 <CalendarIcon className="h-4 w-4 ml-2 shrink-0" />
 <span className="truncate tnum">{displayValue}</span>
 </Button>
 </PopoverTrigger>
 <PopoverContent className="w-auto p-0" align="start">
 <Calendar
 mode="single"
 selected={selectedDate}
 onSelect={handleSelect}
 initialFocus
 />
 </PopoverContent>
 </Popover>
 );
}
