import { ReactNode } from "react";
import Sidebar from "@/components/sidebar";
import { requireUser } from "@/lib/session-auth";
import { isEncryptionKeyConfigured } from "@/lib/secret-crypto";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const currentUser = await requireUser("viewer");

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        currentUser={currentUser}
        encryptionConfigured={isEncryptionKeyConfigured()}
      />
      <main className="dash-main">{children}</main>
    </div>
  );
}
