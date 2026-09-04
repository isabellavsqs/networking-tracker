"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { neon } from "@/lib/neon-client";
import { friendlyContactError } from "@/lib/error-messages";
import type { Contact } from "@/types/contact";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type SortKey = "name" | "company" | "priority" | "met_where";
export type SortDirection = "asc" | "desc";

interface ContactTableProps {
  contacts: Contact[];
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSortChange: (key: SortKey) => void;
  onEdit: (contact: Contact) => void;
  onDeleted: () => void;
}

const priorityVariant: Record<Contact["priority"], "destructive" | "default" | "secondary"> = {
  high: "destructive",
  medium: "default",
  low: "secondary",
};

function SortButton({
  label,
  sortKeyValue,
  activeKey,
  direction,
  onClick,
}: {
  label: string;
  sortKeyValue: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onClick: () => void;
}) {
  const Icon =
    activeKey === sortKeyValue
      ? direction === "asc"
        ? ArrowUp
        : ArrowDown
      : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 font-medium hover:text-foreground"
    >
      {label}
      <Icon className="size-3.5" />
    </button>
  );
}

export function ContactTable({
  contacts,
  sortKey,
  sortDirection,
  onSortChange,
  onEdit,
  onDeleted,
}: ContactTableProps) {
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await neon
        .from("contacts")
        .delete()
        .eq("id", deleteTarget.id);
      if (error) {
        toast.error(friendlyContactError(error));
        return;
      }
      toast.success("Contact deleted.");
      setDeleteTarget(null);
      onDeleted();
    } catch (err) {
      toast.error(friendlyContactError(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {/* Desktop / tablet table */}
      <div className="hidden overflow-x-auto rounded-md border sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortButton
                  label="Name"
                  sortKeyValue="name"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onClick={() => onSortChange("name")}
                />
              </TableHead>
              <TableHead>
                <SortButton
                  label="Company"
                  sortKeyValue="company"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onClick={() => onSortChange("company")}
                />
              </TableHead>
              <TableHead>Role</TableHead>
              <TableHead>
                <SortButton
                  label="Met at"
                  sortKeyValue="met_where"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onClick={() => onSortChange("met_where")}
                />
              </TableHead>
              <TableHead>
                <SortButton
                  label="Priority"
                  sortKeyValue="priority"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onClick={() => onSortChange("priority")}
                />
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((contact) => (
              <TableRow key={contact.id}>
                <TableCell className="font-medium">{contact.name}</TableCell>
                <TableCell>{contact.company || "—"}</TableCell>
                <TableCell>{contact.role || "—"}</TableCell>
                <TableCell>{contact.met_where || "—"}</TableCell>
                <TableCell>
                  <Badge variant={priorityVariant[contact.priority]}>
                    {contact.priority}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Edit ${contact.name}`}
                      onClick={() => onEdit(contact)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete ${contact.name}`}
                      onClick={() => setDeleteTarget(contact)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile stacked cards */}
      <div className="flex flex-col gap-3 sm:hidden">
        {contacts.map((contact) => (
          <div key={contact.id} className="rounded-md border p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{contact.name}</p>
                {contact.company && (
                  <p className="text-sm text-muted-foreground">
                    {contact.role ? `${contact.role} · ` : ""}
                    {contact.company}
                  </p>
                )}
              </div>
              <Badge variant={priorityVariant[contact.priority]}>
                {contact.priority}
              </Badge>
            </div>
            {contact.met_where && (
              <p className="mt-2 text-sm text-muted-foreground">
                Met at: {contact.met_where}
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onEdit(contact)}
              >
                <Pencil className="size-3.5" /> Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDeleteTarget(contact)}
              >
                <Trash2 className="size-3.5" /> Delete
              </Button>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {deleteTarget?.name}. This can&apos;t
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
