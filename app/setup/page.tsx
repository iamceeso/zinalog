import { redirect } from "next/navigation";
import AuthForm from "@/components/auth-form";
import { getCurrentUser, needsSetup } from "@/lib/session-auth";

export default async function SetupPage() {
  if (!(await needsSetup())) {
    const user = await getCurrentUser();
    redirect(user ? "/dashboard" : "/login");
  }

  return <AuthForm mode="setup" />;
}
