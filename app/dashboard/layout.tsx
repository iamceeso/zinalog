import { ReactNode } from "react";
import Sidebar from "@/components/sidebar";
import { requireUser } from "@/lib/session-auth";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const currentUser = await requireUser("viewer");

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar currentUser={currentUser} />
      <main className="dash-main">
        {children}
      </main>
    </div>
  );
}
