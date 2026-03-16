import { ReactNode } from "react";
import { requireUser } from "@/lib/session-auth";

export default async function KeysLayout({ children }: { children: ReactNode }) {
  await requireUser("operator");
  return children;
}
