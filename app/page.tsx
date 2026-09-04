"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { neon } from "@/lib/neon-client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const session = neon.auth.useSession();
  const router = useRouter();

  useEffect(() => {
    if (!session.isPending && session.data) {
      router.replace("/dashboard");
    }
  }, [session.isPending, session.data, router]);

  if (session.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (session.data) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Networking Tracker
        </h1>
        <p className="max-w-md text-muted-foreground">
          Keep track of the people you want to stay connected with at
          Berkeley — where you met, what they do, and how important the
          relationship is to you.
        </p>
      </div>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/sign-up">Get started</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </div>
    </div>
  );
}
