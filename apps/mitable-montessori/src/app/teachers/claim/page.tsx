import * as React from "react";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { lookupInvitation, InvitationError } from "@/lib/teachers/invitations";
import { ClaimForm } from "./claim-form";
import { ClaimShell } from "./claim-shell";

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function TeacherClaimPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <ClaimShell
        eyebrow="Invitation"
        title="No invite link found"
        body="The link you followed didn't include an invitation token. Ask the admin who invited you to resend the email."
      />
    );
  }

  const admin = createAdminClient();
  let preview: { email: string; schoolName: string };
  try {
    const invitation = await lookupInvitation(admin, token);
    const { data: school } = await admin
      .from("schools")
      .select("name")
      .eq("id", invitation.schoolId)
      .maybeSingle();
    preview = {
      email: invitation.email,
      schoolName: (school as { name?: string } | null)?.name ?? "your school",
    };
  } catch (err) {
    if (err instanceof InvitationError) {
      if (err.code === "expired") {
        return (
          <ClaimShell
            eyebrow="Invitation expired"
            title="This invite has expired"
            body="Invite links are good for 14 days. Ask the admin who invited you to send a new one."
          />
        );
      }
      if (err.code === "already_claimed") {
        // The user already set up an account — bounce them to login.
        redirect("/login");
      }
      return (
        <ClaimShell
          eyebrow="Invitation"
          title="We couldn't find this invite"
          body="Double-check the link. If it still doesn't work, ask the admin who invited you to resend the email."
        />
      );
    }
    return (
      <ClaimShell
        eyebrow="Invitation"
        title="Something went wrong"
        body={(err as Error).message}
      />
    );
  }

  return (
    <ClaimShell
      eyebrow={`Join ${preview.schoolName}`}
      title="Set up your teacher account"
      body={`We'll use ${preview.email} as your sign-in. Pick a password and tell us your name.`}
    >
      <ClaimForm token={token} email={preview.email} schoolName={preview.schoolName} />
    </ClaimShell>
  );
}
