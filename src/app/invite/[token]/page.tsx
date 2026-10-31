import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { inviteState, normaliseEmail } from "@/lib/invites";
import AcceptInvite from "./AcceptInvite";

// Joining a workspace from an invitation link.
//
// Outside the dashboard group on purpose: the person opening it is not a
// member of anything yet, so requireOrg would bounce them to their own
// workspace or provision a new one — which is the opposite of joining.
//
// Read with the service role, because no row-level policy would let a
// non-member see the invitation. Nothing sensitive is shown: the workspace
// name and the invited address, which whoever holds the link already has.

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!isSupabaseConfigured()) {
    return <Shell title="Not configured">This deployment has no database yet.</Shell>;
  }

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("org_invites")
    .select("id, org_id, email, role, expires_at, accepted_at, revoked_at, token")
    .eq("token", token)
    .maybeSingle();

  if (!invite) {
    return (
      <Shell title="This link isn't valid">
        Ask whoever invited you to send a new one. Links expire after seven days.
      </Shell>
    );
  }

  const state = inviteState(invite);
  if (state !== "pending") {
    const said = {
      accepted: "This invitation has already been used.",
      revoked: "This invitation was cancelled.",
      expired: "This invitation has expired.",
      pending: "",
    }[state];

    return (
      <Shell title={said}>
        Ask whoever invited you to send a new one, then open that link instead.
      </Shell>
    );
  }

  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", invite.org_id)
    .maybeSingle();

  // Whether they are signed in, and as whom. The action checks this again
  // server-side; this is only so the page can say what to do next rather
  // than failing after a click.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const signedInAs = normaliseEmail(user?.email ?? "");
  const rightAccount = Boolean(user) && signedInAs === invite.email;

  return (
    <Shell title={`Join ${org?.name ?? "the workspace"}`}>
      <p className="mb-5">
        You have been invited as{" "}
        <strong className="text-white/80">
          {invite.role === "admin" ? "an admin" : "a member"}
        </strong>{" "}
        of {org?.name ?? "this workspace"}, at{" "}
        <strong className="text-white/80">{invite.email}</strong>.
      </p>

      {rightAccount ? (
        <AcceptInvite token={token} orgName={org?.name ?? "the workspace"} />
      ) : user ? (
        <div className="space-y-3">
          <p className="text-[#FACC15] text-sm leading-relaxed">
            You are signed in as {signedInAs || "another account"}. This invitation is for{" "}
            {invite.email}.
          </p>
          <p className="text-sm text-white/50 leading-relaxed">
            Sign out, sign in with {invite.email}, then open this link again.
          </p>
          <Link href="/auth/login" className="btn-secondary text-sm inline-flex">
            Go to sign in
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-white/50 leading-relaxed">
            Sign in with {invite.email} — or create an account with that address — then open this
            link again to join.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/auth/login" className="btn-primary text-sm">
              Sign in
            </Link>
            <Link href="/auth/register" className="btn-secondary text-sm">
              Create an account
            </Link>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen grid place-items-center px-4 py-12 bg-[var(--app-bg)]">
      <div className="glass-card p-6 sm:p-8 w-full max-w-md">
        <h1 className="text-xl font-bold tracking-tight mb-3">{title}</h1>
        <div className="text-sm text-white/60 leading-relaxed">{children}</div>
      </div>
    </main>
  );
}
