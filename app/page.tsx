import { redirect } from "next/navigation";
import { getCurrentUser, needsSetup } from "@/lib/session-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (await needsSetup()) {
    redirect("/setup");
  }

  const user = await getCurrentUser();
  redirect(user ? "/dashboard" : "/login");
}
