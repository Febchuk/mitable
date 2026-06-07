import { redirect } from "next/navigation";

import { adminAppHomePath } from "@/lib/feature-flags";

export default function AdminIndexPage() {
  redirect(adminAppHomePath());
}
