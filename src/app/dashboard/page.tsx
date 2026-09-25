import { redirect } from "next/navigation";

// The old demo dashboard lived here. Anyone with it bookmarked lands on the
// real overview instead of a 404.
export default function LegacyDashboardRedirect() {
  redirect("/overview");
}
