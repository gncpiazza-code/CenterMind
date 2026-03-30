"use client";

import { useAuthContext } from "@/contexts/AuthContext";

export function useAuth() {
  const context = useAuthContext();
  return context;
}
