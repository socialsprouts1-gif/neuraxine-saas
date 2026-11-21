import "server-only";

import { hostKey } from "@/lib/brand";
import { dnsInstructionFor, type DnsInstruction, type DomainState } from "@/lib/custom-domain";

// Adding an agency's domain to the hosting project, from inside the app.
//
// Until this existed, an agency's custom domain took three people-steps:
// the agency points DNS, the platform owner opens Vercel and adds the
// domain by hand, then the platform owner pastes it into the brand. The
// middle one is the problem — it means every agency waits on one person
// being at a computer, and it is the step that gets forgotten.
//
// So the app does it. The agency types their domain in their own panel,
// this registers it with the hosting project, and the screen shows them
// the exact record to add and then watches until it resolves.
//
// Everything here degrades to nothing rather than breaking. A deployment
// with no API token keeps working exactly as it did — the domain is still
// saved on the brand, and the screen says the platform owner has to add
// it. That is worse than self-serve and much better than a 500.

const API = "https://api.vercel.com";

interface VercelEnv {
  token: string;
  projectId: string;
  teamId: string;
}

function vercelEnv(): VercelEnv | null {
  const token = process.env.VERCEL_API_TOKEN?.trim() ?? "";
  const projectId = process.env.VERCEL_PROJECT_ID?.trim() ?? "";
  const teamId = process.env.VERCEL_TEAM_ID?.trim() ?? "";
  if (!token || !projectId) return null;
  return { token, projectId, teamId };
}

/** Whether an agency can set their own domain up without anybody's help. */
export function selfServeDomains(): boolean {
  return vercelEnv() !== null;
}

function url(env: VercelEnv, path: string): string {
  const query = env.teamId ? `?teamId=${encodeURIComponent(env.teamId)}` : "";
  return `${API}${path}${query}`;
}

async function call(
  env: VercelEnv,
  path: string,
  init: RequestInit = {}
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const response = await fetch(url(env, path), {
    ...init,
    headers: {
      Authorization: `Bearer ${env.token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    // Bounded. A hosting API that is slow must not hold a form open.
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });

  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  return { ok: response.ok, status: response.status, body };
}

/** Vercel's error wording, where it is usable, and ours where it is not. */
function reasonFrom(body: Record<string, unknown>, fallback: string): string {
  const error = body.error as { code?: string; message?: string } | undefined;
  if (error?.code === "forbidden") {
    return "The hosting account refused the change. The platform owner needs to check the API token.";
  }
  if (error?.code === "domain_already_in_use") {
    return "That domain is already attached to another project.";
  }
  return error?.message?.trim() || fallback;
}

export interface DomainResult {
  ok: boolean;
  state: DomainState;
  /** What to add at the DNS provider. */
  instruction: DnsInstruction;
  /** Set when something is wrong, in words somebody can act on. */
  problem?: string;
}

/**
 * Attaches a domain to the hosting project.
 *
 * Adding a domain that is already attached is a success, not an error:
 * an agency pressing the button twice means they want the domain, and
 * the second press should tell them where it has got to rather than
 * refuse.
 */
export async function attachDomain(domain: string): Promise<DomainResult> {
  const name = hostKey(domain);
  const instruction = dnsInstructionFor(name);
  const env = vercelEnv();

  if (!env) {
    return {
      ok: false,
      state: "none",
      instruction,
      problem:
        "This deployment cannot add domains on its own yet. Ask the platform owner to add it to the hosting project.",
    };
  }

  try {
    const added = await call(env, `/v10/projects/${env.projectId}/domains`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });

    const code = (added.body.error as { code?: string } | undefined)?.code;
    const already = code === "domain_already_exists" || code === "domain_already_in_use_by_this_project";

    if (!added.ok && !already) {
      return {
        ok: false,
        state: "none",
        instruction,
        problem: reasonFrom(added.body, "The hosting project would not accept that domain."),
      };
    }

    // Straight on to the status, so the screen can say "add this record"
    // or "it is already live" rather than "added" and nothing else.
    return await domainStatus(name);
  } catch (error) {
    return {
      ok: false,
      state: "none",
      instruction,
      problem:
        error instanceof Error && error.name === "TimeoutError"
          ? "The hosting service did not answer in time. Try again in a moment."
          : "The domain could not be added just now.",
    };
  }
}

/**
 * How far along a domain is.
 *
 * Two questions, because they fail separately: does the hosting project
 * know about the domain, and does the domain actually point here. A
 * domain can be attached for weeks with nobody having touched DNS.
 */
export async function domainStatus(domain: string): Promise<DomainResult> {
  const name = hostKey(domain);
  const fallback = dnsInstructionFor(name);
  const env = vercelEnv();

  if (!env) {
    return { ok: false, state: "none", instruction: fallback, problem: "Not configured." };
  }

  try {
    const [project, config] = await Promise.all([
      call(env, `/v9/projects/${env.projectId}/domains/${encodeURIComponent(name)}`),
      call(env, `/v6/domains/${encodeURIComponent(name)}/config`),
    ]);

    if (!project.ok) {
      return {
        ok: false,
        state: "none",
        instruction: fallback,
        problem: "That domain is not attached to the hosting project yet.",
      };
    }

    // Ownership first. Until Vercel is satisfied the domain is the
    // agency's, it hands back the exact record it wants to see — which is
    // better than anything this file could guess.
    const verification = project.body.verification as
      | Array<{ type?: string; domain?: string; value?: string }>
      | undefined;

    if (project.body.verified === false && verification?.length) {
      const first = verification[0];
      return {
        ok: true,
        state: "pending",
        instruction: {
          type: (first.type ?? "TXT").toUpperCase() === "CNAME" ? "CNAME" : "A",
          name: first.domain ?? name,
          value: first.value ?? fallback.value,
          note: "Your hosting provider asked for this exact record to prove the domain is yours.",
        },
      };
    }

    const misconfigured = config.body.misconfigured === true;
    return {
      ok: true,
      state: misconfigured ? "pending" : "live",
      instruction: fallback,
    };
  } catch {
    return {
      ok: false,
      state: "pending",
      instruction: fallback,
      problem: "Could not check the domain just now. It may still be working.",
    };
  }
}

/** Detaches a domain, for an agency that is moving or made a typo. */
export async function detachDomain(domain: string): Promise<{ ok: boolean; problem?: string }> {
  const env = vercelEnv();
  if (!env) return { ok: true };

  try {
    const name = hostKey(domain);
    const removed = await call(env, `/v9/projects/${env.projectId}/domains/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });

    // Already gone is the outcome that was wanted.
    if (!removed.ok && removed.status !== 404) {
      return { ok: false, problem: reasonFrom(removed.body, "The domain could not be removed.") };
    }
    return { ok: true };
  } catch {
    return { ok: false, problem: "The domain could not be removed just now." };
  }
}
