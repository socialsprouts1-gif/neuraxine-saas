"use client";

import ActionForm from "@/components/ui/ActionForm";
import { importShiprocketOrders } from "../integration-actions";

/**
 * Pulls Shiprocket's own orders in.
 *
 * Orders raised in their dashboard are still orders. Matching ones are
 * updated with the tracking number and courier; the rest are brought in,
 * because a shipping screen that shows half of them is a screen you
 * cannot trust to be the whole picture.
 */
export default function FetchFromShiprocket() {
  return (
    <ActionForm action={importShiprocketOrders} submitLabel="Fetch from Shiprocket" compact>
      <input type="hidden" name="_" value="" />
    </ActionForm>
  );
}
