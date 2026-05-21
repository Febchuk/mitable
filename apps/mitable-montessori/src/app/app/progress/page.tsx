import { redirect } from "next/navigation";
import { addTodayProgressAndAgent } from "@/lib/feature-flags";
import ProgressClient from "./progress-client";

export default function ProgressPage() {
  if (!addTodayProgressAndAgent()) {
    redirect("/app/reports?notice=progress-moved");
  }
  return <ProgressClient />;
}
