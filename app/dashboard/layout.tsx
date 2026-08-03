import { ReactNode } from "react";
import Sidebar from "@/components/sidebar";
import { requireUser } from "@/lib/session-auth";
import { isEncryptionKeyConfigured } from "@/lib/secret-crypto";

// Never statically cache the dashboard shell — every navigation (including
// browser back/forward) must re-run requireUser() so an ended session
// redirects to /login instead of rendering a stale authenticated page.
export const dynamic = "force-dynamic";

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
