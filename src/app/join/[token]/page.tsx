"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Page() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/participant/join");
  }, [router]);
  return <div className="flex items-center justify-center min-h-screen"><p className="text-gray-500">Redirecting to join page...</p></div>;
}
