import LogGroupPage from "@/components/log-group-page";
import { Bug } from "lucide-react";

export default function DebugGroupsPage() {
  return (
    <LogGroupPage
      level="debug"
      label="Debug"
      color="var(--debug)"
      bgColor="rgba(121,192,255,0.1)"
      borderColor="rgba(121,192,255,0.3)"
      Icon={Bug}
      emptyText="Debug entries will appear here when your applications send debug-level logs"
      statLabel="Debug"
    />
  );
}
