import LogGroupPage from "@/components/log-group-page";
import { AlertTriangle } from "lucide-react";

export default function ErrorGroupsPage() {
  return (
    <LogGroupPage
      level="error"
      label="Error"
      color="var(--error)"
      bgColor="rgba(248,81,73,0.1)"
      borderColor="rgba(248,81,73,0.3)"
      Icon={AlertTriangle}
      emptyText="Errors will appear here when your applications send error-level logs"
      statLabel="Error"
    />
  );
}
