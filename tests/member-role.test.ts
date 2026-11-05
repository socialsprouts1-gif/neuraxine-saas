import test from "node:test";
import assert from "node:assert/strict";
import {
  ORG_ROLES,
  isOrgRole,
  canManage,
  readSignupRole,
  roleChangeBlocked,
  DEFAULT_SIGNUP_ROLE,
  LAST_OWNER,
  NOT_A_MEMBER,
} from "../src/lib/member-role.ts";

test("the three roles are the three roles", () => {
  assert.deepEqual([...ORG_ROLES], ["owner", "admin", "member"]);
});

test("isOrgRole rejects anything that is not one of them", () => {
  assert.equal(isOrgRole("owner"), true);
  assert.equal(isOrgRole("Owner"), false);
  assert.equal(isOrgRole("superuser"), false);
  assert.equal(isOrgRole(null), false);
  assert.equal(isOrgRole(undefined), false);
  assert.equal(isOrgRole(2), false);
});

test("owner and admin manage, member does not", () => {
  assert.equal(canManage("owner"), true);
  assert.equal(canManage("admin"), true);
  assert.equal(canManage("member"), false);
});

// --- the signup role ------------------------------------------------------

test("signup role falls back to owner when nothing is configured", () => {
  assert.equal(readSignupRole(null), "owner");
  assert.equal(readSignupRole(undefined), "owner");
  assert.equal(readSignupRole({}), "owner");
  assert.equal(DEFAULT_SIGNUP_ROLE, "owner");
});

test("signup role reads what was configured", () => {
  assert.equal(readSignupRole({ default_role: "member" }), "member");
  assert.equal(readSignupRole({ default_role: "admin" }), "admin");
});

test("a nonsense signup role is ignored rather than trusted", () => {
  // The setting is JSON somebody can edit by hand. A typo must not become
  // a role no policy recognises, which would lock every new signup out of
  // their own workspace.
  assert.equal(readSignupRole({ default_role: "onwer" }), "owner");
  assert.equal(readSignupRole({ default_role: "" }), "owner");
  assert.equal(readSignupRole({ default_role: 3 }), "owner");
});

// --- the last-owner guard -------------------------------------------------

const owner = { user_id: "a", role: "owner" };
const admin = { user_id: "b", role: "admin" };
const member = { user_id: "c", role: "member" };

test("the only owner cannot be demoted", () => {
  assert.equal(roleChangeBlocked([owner, admin, member], "a", "member"), LAST_OWNER);
  assert.equal(roleChangeBlocked([owner, admin, member], "a", "admin"), LAST_OWNER);
});

test("an owner can be demoted once somebody else is one", () => {
  const two = [owner, { user_id: "b", role: "owner" }];
  assert.equal(roleChangeBlocked(two, "a", "member"), null);
  assert.equal(roleChangeBlocked(two, "b", "member"), null);
});

test("anybody else can be changed freely", () => {
  const members = [owner, admin, member];
  assert.equal(roleChangeBlocked(members, "b", "member"), null);
  assert.equal(roleChangeBlocked(members, "c", "admin"), null);
  assert.equal(roleChangeBlocked(members, "c", "owner"), null);
});

test("promoting to owner is never blocked", () => {
  // Even on the sole owner's own row, where the change is a no-op.
  assert.equal(roleChangeBlocked([owner], "a", "owner"), null);
});

test("a membership that is not there is refused, not silently allowed", () => {
  // Otherwise the update runs, matches nothing, and reports success —
  // which is the whole class of bug this function exists to stop.
  assert.equal(roleChangeBlocked([owner, admin], "zzz", "member"), NOT_A_MEMBER);
  assert.equal(roleChangeBlocked([], "a", "member"), NOT_A_MEMBER);
});

test("a null role in the row is treated as not being an owner", () => {
  const rows = [{ user_id: "a", role: null }, owner];
  assert.equal(roleChangeBlocked(rows, "a", "member"), null);
});
