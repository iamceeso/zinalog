import { getStats } from "@/lib/db";
import OverviewClient from "@/components/overview-client";
import { requireUser } from "@/lib/session-auth";

export default async function DashboardPage() {
  const currentUser = await requireUser("viewer");
  const initialStats = await getStats(currentUser.allowed_services);
  return <OverviewClient initialStats={initialStats} />;
}
