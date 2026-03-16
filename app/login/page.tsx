import { redirect } from "next/navigation";
import AuthForm from "@/components/auth-form";
import { getCurrentUser, needsSetup } from "@/lib/session-auth";

export default async function LoginPage() {
  if (await needsSetup()) {
    redirect("/setup");
  }

  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  return <AuthForm mode="login" />;
}
