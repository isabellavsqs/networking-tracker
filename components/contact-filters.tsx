"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRIORITIES, type Priority } from "@/types/contact";

interface ContactFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  priority: Priority | "all";
  onPriorityChange: (value: Priority | "all") => void;
}

export function ContactFilters({
  search,
  onSearchChange,
  priority,
  onPriorityChange,
}: ContactFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search by name or company..."
        className="sm:max-w-xs"
        aria-label="Search contacts"
      />
      <Select
        value={priority}
        onValueChange={(value) => onPriorityChange(value as Priority | "all")}
      >
        <SelectTrigger className="sm:w-40" aria-label="Filter by priority">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All priorities</SelectItem>
          {PRIORITIES.map((p) => (
            <SelectItem key={p} value={p}>
              {p[0].toUpperCase() + p.slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
