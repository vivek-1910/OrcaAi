"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OrcaSelectOption = {
  value: string;
  label: string;
};

type OrcaSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: OrcaSelectOption[];
  ariaLabel: string;
  placeholder?: string;
};

export default function OrcaSelect({ value, onValueChange, options, ariaLabel, placeholder }: OrcaSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="orca-select-trigger" aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="orca-select-content">
        {options.map((option) => (
          <SelectItem className="orca-select-item" key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
