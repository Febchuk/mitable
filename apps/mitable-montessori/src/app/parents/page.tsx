import { redirect } from "next/navigation";
import { getParentPortalContext } from "@/lib/parents/portal";

export default async function ParentsHome() {
  const portal = await getParentPortalContext();
  if (!portal) redirect("/parents/login");
  if (!portal.onboardingComplete) redirect("/parents/onboarding");
  const child = portal.children[0];
  if (child) redirect(`/parents/overview?child=${child.id}`);

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="font-display text-3xl">No children linked yet</h1>
      <p className="mt-3 text-sm text-ink-secondary">
        Your school can update your family&apos;s details when a child should appear here.
      </p>
    </div>
  );
}
