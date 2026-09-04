"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { neon } from "@/lib/neon-client";
import { contactSchema } from "@/lib/contact-schema";
import { friendlyContactError } from "@/lib/error-messages";
import type { Contact, Priority } from "@/types/contact";
import { PRIORITIES } from "@/types/contact";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ContactFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact | null;
  onSaved: () => void;
}

const emptyForm = {
  name: "",
  company: "",
  role: "",
  met_where: "",
  notes: "",
  priority: "medium" as Priority,
};

export function ContactForm({
  open,
  onOpenChange,
  contact,
  onSaved,
}: ContactFormProps) {
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Reset the form to the contact being edited (or blank) whenever the
    // dialog opens — this synchronizes local form state with the `contact` prop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFormError(null);
    setFieldErrors({});
    if (contact) {
      setForm({
        name: contact.name,
        company: contact.company ?? "",
        role: contact.role ?? "",
        met_where: contact.met_where ?? "",
        notes: contact.notes ?? "",
        priority: contact.priority,
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, contact]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const parsed = contactSchema.safeParse(form);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string") errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    const payload = {
      name: parsed.data.name,
      company: parsed.data.company || null,
      role: parsed.data.role || null,
      met_where: parsed.data.met_where || null,
      notes: parsed.data.notes || null,
      priority: parsed.data.priority,
    };

    setSaving(true);
    try {
      const { error } = contact
        ? await neon.from("contacts").update(payload).eq("id", contact.id)
        : await neon.from("contacts").insert(payload);

      if (error) {
        setFormError(friendlyContactError(error));
        return;
      }

      toast.success(contact ? "Contact updated." : "Contact added.");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setFormError(friendlyContactError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {contact ? "Edit contact" : "Add contact"}
            </DialogTitle>
            <DialogDescription>
              {contact
                ? "Update the details for this contact."
                : "Add someone to your networking tracker."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-name">Name</Label>
              <Input
                id="contact-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                aria-invalid={!!fieldErrors.name}
              />
              {fieldErrors.name && (
                <p className="text-sm text-destructive">
                  {fieldErrors.name}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="contact-company">Company</Label>
                <Input
                  id="contact-company"
                  value={form.company}
                  onChange={(e) =>
                    setForm({ ...form, company: e.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="contact-role">Role</Label>
                <Input
                  id="contact-role"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-met">Where you met</Label>
              <Input
                id="contact-met"
                value={form.met_where}
                onChange={(e) =>
                  setForm({ ...form, met_where: e.target.value })
                }
                placeholder="e.g. CS 186 study group, career fair"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-priority">Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(value) =>
                  setForm({ ...form, priority: value as Priority })
                }
              >
                <SelectTrigger id="contact-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p[0].toUpperCase() + p.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.priority && (
                <p className="text-sm text-destructive">
                  {fieldErrors.priority}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-notes">Notes</Label>
              <Textarea
                id="contact-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : contact ? "Save changes" : "Add contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
