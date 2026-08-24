import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { InvitationError, lookupInvitation } from "@/lib/parents/invitations";
import { ClaimShell } from "../../teachers/claim/claim-shell";
import { ParentClaimForm } from "./parent-claim-form";

export default async function ParentClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <ClaimShell
        eyebrow="Invitation"
        title="No invite link found"
        body="Use the link from your invitation email. If it is lost or expired, ask the school to send a new one."
      />
    );
  }

  try {
    const invitation = await lookupInvitation(createAdminClient(), token);
    const { data: school } = await createAdminClient()
      .from("schools")
      .select("name")
      .eq("id", invitation.schoolId)
      .maybeSingle();
    const schoolName = (school as { name?: string } | null)?.name ?? "your school";
    return (
      <ClaimShell
        eyebrow={`Join ${schoolName}`}
        title="Set up your parent account"
        body={`We'll use ${invitation.email} as your sign-in. Choose a password to follow your child's learning.`}
      >
        <ParentClaimForm token={token} email={invitation.email} schoolName={schoolName} />
      </ClaimShell>
    );
  } catch (err) {
    if (err instanceof InvitationError && err.code === "already_claimed")
      redirect("/parents/login");
    const title =
      err instanceof InvitationError && err.code === "expired"
        ? "This invite has expired"
        : "We couldn't find this invite";
    const body =
      err instanceof InvitationError && err.code === "expired"
        ? "Invite links work for 14 days. Ask the school to send a new one."
        : "Double-check the link. If it still does not work, ask the school to resend the invitation.";
    return <ClaimShell eyebrow="Invitation" title={title} body={body} />;
  }
}
