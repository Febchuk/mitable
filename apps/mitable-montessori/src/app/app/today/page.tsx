import { getCurrentUserContext } from "@/lib/app/active-classroom";
import TodayClient from "./today-client";

export default async function TodayPage() {
  const ctx = await getCurrentUserContext();
  return <TodayClient firstName={ctx?.firstName ?? null} />;
}
