import LogGroupPage from "@/components/log-group-page";
import { Info } from "lucide-react";

export default function InfoGroupsPage() {
  return (
    <LogGroupPage
      level="info"
      label="Info"
      color="var(--accent)"
      bgColor="rgba(88,166,255,0.1)"
      borderColor="rgba(88,166,255,0.3)"
      Icon={Info}
      emptyText="Info entries will appear here when your applications send info-level logs"
      statLabel="Info"
    />
  );
}
