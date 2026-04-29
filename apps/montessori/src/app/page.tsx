import { redirect } from "next/navigation";

/**
 * Root index. Always bounces to /login, which itself checks for an
 * existing session and forwards already-signed-in users straight to
 * their landing page (admin → /admin/dashboard, teacher → /teacher/grid).
 */
export default function RootIndex() {
    redirect("/login");
}
