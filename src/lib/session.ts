"use client";
import { Role, User } from "./types";
import { demoUsers } from "./demo";

const KEY = "qm.session";

export function setSession(role: Role) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, role);
}
export function getSession(): User | null {
  if (typeof window === "undefined") return null;
  const r = localStorage.getItem(KEY) as Role | null;
  if (!r) return null;
  return demoUsers[r] ?? null;
}
export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
