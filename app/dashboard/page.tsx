"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, LogOut } from "lucide-react";
import { neon } from "@/lib/neon-client";
import { friendlyContactError } from "@/lib/error-messages";
import type { Contact, Priority } from "@/types/contact";
import { RequireAuth } from "@/components/require-auth";
import { ContactFilters } from "@/components/contact-filters";
import {
  ContactTable,
  type SortDirection,
  type SortKey,
} from "@/components/contact-table";
import { ContactForm } from "@/components/contact-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

const priorityOrder: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function DashboardContent() {
  const router = useRouter();
  const session = neon.auth.useSession();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">(
    "all"
  );
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const [formOpen, setFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await neon
      .from("contacts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setLoadError(friendlyContactError(error));
    } else {
      setContacts((data as Contact[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Fetch-on-mount: loadContacts sets loading/error/contacts state as the
    // request resolves, which is the intended data-fetching pattern here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadContacts();
  }, [loadContacts]);

  function handleSortChange(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  const visibleContacts = useMemo(() => {
    const term = search.trim().toLowerCase();
    let result = contacts.filter((c) => {
      const matchesSearch =
        !term ||
        c.name.toLowerCase().includes(term) ||
        (c.company ?? "").toLowerCase().includes(term);
      const matchesPriority =
        priorityFilter === "all" || c.priority === priorityFilter;
      return matchesSearch && matchesPriority;
    });

    result = [...result].sort((a, b) => {
      let comparison = 0;
      if (sortKey === "priority") {
        comparison = priorityOrder[a.priority] - priorityOrder[b.priority];
      } else {
        const aVal = (a[sortKey] ?? "").toString().toLowerCase();
        const bVal = (b[sortKey] ?? "").toString().toLowerCase();
        comparison = aVal.localeCompare(bVal);
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [contacts, search, priorityFilter, sortKey, sortDirection]);

  async function handleSignOut() {
    await neon.auth.signOut();
    router.push("/sign-in");
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Your network
          </h1>
          {session.data?.user && (
            <p className="text-sm text-muted-foreground">
              Signed in as {session.data.user.email}
            </p>
          )}
        </div>
        <Button variant="outline" onClick={handleSignOut}>
          <LogOut className="size-4" /> Sign out
        </Button>
      </header>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <ContactFilters
          search={search}
          onSearchChange={setSearch}
          priority={priorityFilter}
          onPriorityChange={setPriorityFilter}
        />
        <Button
          onClick={() => {
            setEditingContact(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" /> Add contact
        </Button>
      </div>

      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : visibleContacts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="font-medium">
              {contacts.length === 0
                ? "No contacts yet"
                : "No contacts match your filters"}
            </p>
            <p className="text-sm text-muted-foreground">
              {contacts.length === 0
                ? "Add your first contact to start building your network."
                : "Try a different search term or priority filter."}
            </p>
            {contacts.length === 0 && (
              <Button
                onClick={() => {
                  setEditingContact(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="size-4" /> Add contact
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <ContactTable
          contacts={visibleContacts}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSortChange={handleSortChange}
          onEdit={(contact) => {
            setEditingContact(contact);
            setFormOpen(true);
          }}
          onDeleted={loadContacts}
        />
      )}

      <ContactForm
        open={formOpen}
        onOpenChange={setFormOpen}
        contact={editingContact}
        onSaved={loadContacts}
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
