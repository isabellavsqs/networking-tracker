import { z } from "zod";

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  company: z.string().trim().optional().or(z.literal("")),
  role: z.string().trim().optional().or(z.literal("")),
  met_where: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal("")),
  priority: z.enum(["high", "medium", "low"], {
    message: "Priority must be high, medium, or low.",
  }),
});

export type ContactFormValues = z.infer<typeof contactSchema>;
