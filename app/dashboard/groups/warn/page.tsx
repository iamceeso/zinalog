import LogGroupPage from "@/components/log-group-page";
import { TriangleAlert } from "lucide-react";

export default function WarnGroupsPage() {
  return (
    <LogGroupPage
      level="warning"
      label="Warning"
      color="var(--warning)"
      bgColor="rgba(210,153,34,0.1)"
      borderColor="rgba(210,153,34,0.3)"
      Icon={TriangleAlert}
      emptyText="Warnings will appear here when your applications send warn-level logs"
      statLabel="Warning"
    />
  );
}
