"use client";

import { Toaster } from "react-hot-toast";

// The thing that makes every toast in the app visible.
//
// Seven screens call toast.success and toast.error — the wallet top-up,
// both Instagram screens, the sequence builder, the journey starters — and
// not one of them produced anything, because react-hot-toast renders
// through a <Toaster /> that has to be mounted somewhere and never was.
// Every confirmation and every error in this app has been going to a
// component that does not exist.
//
// That is why a failed action looked like a button that does nothing: the
// work ran, the server answered, the answer was thrown away. Mounted here
// in the root layout so it covers the dashboard, the auth pages and the
// landing pages alike, rather than being added to one layout and missed on
// the next.
//
// Two deliberate settings:
//
//  * z-index above the modal. Modals here sit at z-100, and a dialog that
//    stays open on failure — which is what every dialog in this app does —
//    would otherwise hide the message explaining the failure.
//
//  * errors last much longer than successes. "Saved" needs two seconds.
//    A refusal from Meta is three sentences somebody has to read and act
//    on, and four seconds is not enough to finish it.
export default function Toasts() {
  return (
    <Toaster
      position="top-center"
      containerStyle={{ zIndex: 200 }}
      toastOptions={{
        duration: 3500,
        style: {
          background: "rgba(18, 18, 24, 0.96)",
          color: "#FFFFFF",
          border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: "14px",
          padding: "12px 16px",
          fontSize: "13px",
          lineHeight: "1.5",
          maxWidth: "min(560px, 92vw)",
          boxShadow: "0 18px 50px rgba(0,0,0,0.5)",
          backdropFilter: "blur(12px)",
        },
        success: {
          duration: 3000,
          iconTheme: { primary: "#00D97E", secondary: "#0B0B10" },
        },
        error: {
          duration: 12000,
          iconTheme: { primary: "#FF5C5C", secondary: "#0B0B10" },
        },
      }}
    />
  );
}
