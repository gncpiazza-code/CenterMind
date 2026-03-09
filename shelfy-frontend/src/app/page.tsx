"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    router.push("/login");
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[var(--shelfy-primary)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
