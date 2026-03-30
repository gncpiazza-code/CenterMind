"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import TutorialModal from "@/components/TutorialModal";

export default function TutorialPage() {
  const router = useRouter();

  const { setTutorialSeen, user } = useAuth();
  const handleTutorialComplete = () => {
    console.log("DEBUG: handleTutorialComplete triggered in /tutorial");
    console.log("DEBUG: User state before setTutorialSeen:", user);
    setTutorialSeen();
    console.log("DEBUG: setTutorialSeen() finished. Redirecting to /dashboard");
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <TutorialModal onComplete={handleTutorialComplete} />
    </div>
  );
}