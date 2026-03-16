import { ReactNode } from "react";
import { requireUser } from "@/lib/session-auth";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requireUser("admin");
  return children;
}
