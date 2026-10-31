"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  armNotificationSound,
  getMuted,
  getMutedOnServer,
  playNotificationSound,
  setMuted,
  subscribeMuted,
} from "@/lib/notification-sound";

/**
 * Listens for inbound messages on this org's number and makes a sound.
 *
 * The page is server-rendered, so it only ever learned about a message on a
 * reload. This subscribes to the messages table over Supabase Realtime —
 * still filtered by RLS, so a subscriber receives only their own org's rows
 * — chimes, and refreshes the route so the message actually appears.
 */
export default function NewMessageAlert({
  orgId,
  activeConversationId,
}: {
  orgId: string;
  /** The thread on screen; a message arriving in it while you are looking
   *  at it does not need a sound. */
  activeConversationId: string | null;
}) {
  const router = useRouter();
  const muted = useSyncExternalStore(subscribeMuted, getMuted, getMutedOnServer);

  useEffect(() => armNotificationSound(), []);

  // A ref so the subscription below does not have to be torn down and
  // rebuilt every time you open a different conversation. The mute state
  // needs no ref — the store is a module-level cache the handler can read.
  const activeRef = useRef(activeConversationId);
  useEffect(() => {
    activeRef.current = activeConversationId;
  }, [activeConversationId]);

  const toggle = useCallback(() => {
    const next = !getMuted();
    setMuted(next);
    // Play on unmute so it is obvious what was just turned on — and the
    // click doubles as the gesture that unlocks audio for the session.
    if (!next) playNotificationSound();
  }, []);

  useEffect(() => {
    let supabase;
    try {
      supabase = createClient();
    } catch {
      // Supabase not configured. The rest of the page already says so.
      return;
    }

    // Realtime applies RLS using the token the socket authenticated with.
    // The browser client picks that up from the auth listener, which can
    // land after this effect — and an unauthenticated socket is silently
    // delivered nothing rather than refused, which looks exactly like the
    // publication being missing. Set it explicitly first.
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const token = data.session?.access_token;
      if (token) supabase.realtime.setAuth(token);
    });

    const channel = supabase
      .channel(`inbox:${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          // Realtime takes one filter, so direction is checked below.
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          const row = payload.new as { direction?: string; conversation_id?: string };
          // Our own replies and the bot's come back through the same channel.
          if (row.direction !== "inbound") return;

          const isOpenAndWatched =
            row.conversation_id === activeRef.current &&
            typeof document !== "undefined" &&
            document.hasFocus();

          if (!getMuted() && !isOpenAndWatched) playNotificationSound();

          // Bring the message onto the screen it just announced.
          router.refresh();
        }
      )
      .subscribe((status) => {
        // Worth one line in the console: a channel that never reaches
        // SUBSCRIBED is the difference between "no messages" and "not
        // listening", and nothing on screen distinguishes them.
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(
            `Inbox realtime did not connect (${status}). New messages will not ` +
              "chime until the page is reloaded. If this persists, check that " +
              "the messages table is in the supabase_realtime publication."
          );
        }
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [orgId, router]);

  return (
    <button
      type="button"
      onClick={toggle}
      title={muted ? "Notification sound is off" : "Notification sound is on"}
      aria-label={muted ? "Turn the notification sound on" : "Turn the notification sound off"}
      aria-pressed={!muted}
      className={`p-2 rounded-lg transition-colors ${
        muted ? "text-white/30 hover:text-white/60" : "text-accent-ink hover:bg-white/8"
      }`}
    >
      {muted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
    </button>
  );
}
