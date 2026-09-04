export type Priority = "high" | "medium" | "low";

export interface Contact {
  id: string;
  user_id: string;
  name: string;
  company: string | null;
  role: string | null;
  met_where: string | null;
  notes: string | null;
  priority: Priority;
  created_at: string;
  updated_at: string;
}

export interface ContactInput {
  name: string;
  company: string | null;
  role: string | null;
  met_where: string | null;
  notes: string | null;
  priority: Priority;
}

export const PRIORITIES: Priority[] = ["high", "medium", "low"];
