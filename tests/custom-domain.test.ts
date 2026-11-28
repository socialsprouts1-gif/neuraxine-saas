import test from "node:test";
import assert from "node:assert/strict";
import {
  APEX_IP,
  SUBDOMAIN_TARGET,
  customDomainProblem,
  describeState,
  dnsInstructionFor,
  isApex,
  wouldReplaceTheirSite,
} from "../src/lib/custom-domain.ts";

// An agency typing their own domain in, unsupervised.
//
// Until this existed somebody at the platform read every domain before it
// went anywhere near the hosting project. Now nobody does, so the checks
// that were a human glance have to hold on their own.

const PLATFORM = "neurachat.in";

test("a normal domain is accepted", () => {
  assert.equal(customDomainProblem("app.acmeagency.com", PLATFORM), null);
  assert.equal(customDomainProblem("acme.com", PLATFORM), null);
  assert.equal(customDomainProblem("chat.acme.co.uk", PLATFORM), null);
  // Typed with capitals and a www, which is how people type domains.
  assert.equal(customDomainProblem("WWW.Acme.com", PLATFORM), null);
});

test("an agency cannot claim the platform's own address", () => {
  // The one that matters. Without it an agency serves their own login
  // page to the platform's customers, under the platform's domain.
  assert.match(customDomainProblem("neurachat.in", PLATFORM) ?? "", /belongs to the platform/i);
  assert.match(customDomainProblem("www.neurachat.in", PLATFORM) ?? "", /belongs to the platform/i);
  assert.match(customDomainProblem("app.neurachat.in", PLATFORM) ?? "", /belongs to the platform/i);
  assert.match(
    customDomainProblem("anything.deep.neurachat.in", PLATFORM) ?? "",
    /belongs to the platform/i
  );
});

test("a domain that merely ends in the same letters is not the platform", () => {
  // evilneurachat.in is somebody else's domain, not a subdomain of ours.
  assert.equal(customDomainProblem("evilneurachat.in", PLATFORM), null);
});

test("hosting addresses are refused", () => {
  for (const host of [
    "my-app.vercel.app",
    "something.netlify.app",
    "localhost",
    "app.herokuapp.com",
  ]) {
    assert.ok(customDomainProblem(host, PLATFORM), `${host} should be refused`);
  }
});

test("a URL pasted where a domain goes is refused with the reason", () => {
  assert.match(customDomainProblem("https://app.acme.com", PLATFORM) ?? "", /no https/i);
  assert.match(customDomainProblem("app.acme.com/login", PLATFORM) ?? "", /slashes/i);
  assert.match(customDomainProblem("app.acme.com:3000", PLATFORM) ?? "", /port/i);
  assert.match(customDomainProblem("", PLATFORM) ?? "", /give the domain/i);
});

test("an IP address is refused", () => {
  assert.match(customDomainProblem("192.168.1.1", PLATFORM) ?? "", /IP address/i);
});

test("the check still works when the platform domain is not configured", () => {
  // PLATFORM_ROOT_DOMAIN unset must not turn into "everything is allowed"
  // for the shape checks, nor into a crash.
  assert.equal(customDomainProblem("app.acme.com", ""), null);
  assert.match(customDomainProblem("https://app.acme.com", "") ?? "", /no https/i);
});

test("a bare domain is told apart from a subdomain", () => {
  assert.ok(isApex("acme.com"));
  assert.ok(isApex("acme.co.uk"));
  assert.ok(isApex("acme.co.in"));
  assert.ok(!isApex("app.acme.com"));
  assert.ok(!isApex("app.acme.co.uk"));
});

test("a bare domain gets an A record, a subdomain gets a CNAME", () => {
  // Not cosmetic. A CNAME on a bare domain cannot sit beside the MX
  // records carrying the agency's email, so suggesting one would stop
  // their mail arriving.
  const apex = dnsInstructionFor("acme.com");
  assert.equal(apex.type, "A");
  assert.equal(apex.name, "@");
  assert.equal(apex.value, APEX_IP);

  const sub = dnsInstructionFor("app.acme.com");
  assert.equal(sub.type, "CNAME");
  assert.equal(sub.name, "app");
  assert.equal(sub.value, SUBDOMAIN_TARGET);
});

test("the CNAME is named after the part in front, whatever it is", () => {
  assert.equal(dnsInstructionFor("chat.acme.com").name, "chat");
  assert.equal(dnsInstructionFor("whatsapp.acme.co.uk").name, "whatsapp");
});

test("every instruction says something about the provider's boxes", () => {
  for (const domain of ["acme.com", "app.acme.com", "acme.co.uk"]) {
    assert.ok(
      dnsInstructionFor(domain).note.length > 20,
      `${domain} has no note explaining the form`
    );
  }
});

test("pointing a bare domain here is flagged as replacing their website", () => {
  assert.ok(wouldReplaceTheirSite("acme.com"));
  assert.ok(!wouldReplaceTheirSite("app.acme.com"));
});

test("each state reads as a sentence somebody can act on", () => {
  assert.match(describeState("live", "app.acme.com"), /live/i);
  assert.match(describeState("pending", "app.acme.com"), /waiting/i);
  assert.match(describeState("none", null), /no domain/i);
});
