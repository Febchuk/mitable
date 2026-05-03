import { getCurrentUserContext } from "@/lib/app/active-classroom";
import AdminTodayClient from "./today-client";

export default async function AdminTodayPage() {
  const ctx = await getCurrentUserContext();
  return (
    <AdminTodayClient
      firstName={ctx?.firstName ?? null}
      schoolName={ctx?.schoolName ?? null}
    />
  );
}
