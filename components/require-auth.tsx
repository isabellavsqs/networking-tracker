"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { neon } from "@/lib/neon-client";
import { Skeleton } from "@/components/ui/skeleton";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const session = neon.auth.useSession();
  const router = useRouter();

  useEffect(() => {
    if (!session.isPending && !session.data) {
      router.replace("/sign-in");
    }
  }, [session.isPending, session.data, router]);

  if (session.isPending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
    );
  }

  if (!session.data) {
    return null;
  }

  return <>{children}</>;
}
