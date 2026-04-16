"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

export interface UseAuthResult {
  user: {
    id: string;
    username: string;
    displayName: string;
  } | null;
  loading: boolean;
  error: string | null;
}

export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState<UseAuthResult["user"]>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch("/api/session/me");
        if (!res.ok) {
          if (res.status === 401) {
            router.push("/");
            return;
          }
          throw new Error("Failed to fetch user");
        }
        const data = await res.json();
        setUser(data.user);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        router.push("/");
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, [router]);

  return { user, loading, error };
}