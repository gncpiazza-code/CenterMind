"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import TutorialModal from "@/components/TutorialModal";

export default function TutorialPage() {
  const router = useRouter();

  const handleTutorialComplete = () => {
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <TutorialModal onComplete={handleTutorialComplete} />
    </div>
  );
}