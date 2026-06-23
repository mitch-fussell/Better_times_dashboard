"use client";

import { useState } from "react";
import CheckInModal from "@/components/CheckInModal";
import { type Client } from "@/lib/metrics";

export default function LogCheckIn({
  clients,
  defaultClientId,
  variant = "primary",
}: {
  clients: Pick<Client, "id" | "name">[];
  defaultClientId?: string;
  variant?: "primary" | "row";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          variant === "primary"
            ? "rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark"
            : "rounded-md border border-brand px-2.5 py-1 text-xs font-medium text-brand hover:bg-blue-50"
        }
      >
        {variant === "primary" ? "+ Log check-in" : "Log"}
      </button>

      {open && (
        <CheckInModal
          onClose={() => setOpen(false)}
          clients={clients}
          defaultClientId={defaultClientId}
        />
      )}
    </>
  );
}
