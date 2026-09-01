"use client";

import { format } from "date-fns";
import { CalendarDays, Check, ChevronDown, Clock3 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type OrcaDateTimePickerProps = {
  id: string;
  label: string;
  value?: string;
  onChange: (value: string | undefined) => void;
};

const DEFAULT_TIME = "06:00";

function parseDateTime(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function timeValueFromDate(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function timeLabel(value: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return format(date, "h:mm a");
}

function dateWithTime(date: Date, value: string): Date | undefined {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return undefined;

  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

export default function OrcaDateTimePicker({ id, label, value, onChange }: OrcaDateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseDateTime(value);
  const timeValue = selectedDate ? timeValueFromDate(selectedDate) : DEFAULT_TIME;

  const commitDateTime = (date: Date | undefined, time: string) => {
    const next = date ? dateWithTime(date, time) : undefined;
    onChange(next?.toISOString());
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    commitDateTime(date, timeValue);
  };

  const handleTimeChange = (nextTime: string) => {
    if (selectedDate) commitDateTime(selectedDate, nextTime);
  };

  const clearDateTime = () => {
    onChange(undefined);
  };

  const displayValue = selectedDate
    ? `${format(selectedDate, "MMM d, yyyy")} · ${timeLabel(timeValue)}`
    : "Select date & time";

  return (
    <div className="onboarding-date-picker">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="onboarding-date-trigger"
            aria-label={`${label}: ${displayValue}`}
            aria-expanded={open}
          >
            <CalendarDays size={16} strokeWidth={1.9} aria-hidden="true" />
            <span className={cn(!selectedDate && "onboarding-date-placeholder")}>{displayValue}</span>
            <ChevronDown className="onboarding-date-trigger-chevron" size={15} strokeWidth={1.9} aria-hidden="true" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="onboarding-date-popover" align="start" sideOffset={9}>
          <div className="onboarding-date-popover-body">
            <div className="onboarding-date-popover-heading">
              <div>
                <span className="onboarding-date-popover-kicker">{label}</span>
                <strong>{selectedDate ? displayValue : "Choose a date and time"}</strong>
              </div>
              <span className="onboarding-date-popover-icon" aria-hidden="true"><CalendarDays size={17} strokeWidth={1.8} /></span>
            </div>

            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              defaultMonth={selectedDate ?? new Date()}
              className="onboarding-calendar"
            />

            <div className="onboarding-date-time-row">
              <span className="onboarding-date-time-label"><Clock3 size={14} strokeWidth={1.9} aria-hidden="true" /> Time</span>
              <Input
                id={`${id}-time`}
                type="time"
                value={timeValue}
                onChange={(event) => handleTimeChange(event.target.value)}
                className="onboarding-time-input"
                disabled={!selectedDate}
                aria-label={`${label} time`}
              />
            </div>
          </div>

          <div className="onboarding-date-actions">
            <Button type="button" variant="ghost" size="sm" className="onboarding-date-clear" onClick={clearDateTime} disabled={!selectedDate}>
              Clear
            </Button>
            <Button type="button" size="sm" className="onboarding-date-done" onClick={() => setOpen(false)} disabled={!selectedDate}>
              Done
              <Check size={14} strokeWidth={2.4} aria-hidden="true" />
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
