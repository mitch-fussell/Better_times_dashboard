"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Opt = { id: string; name: string };

export default function ClientCombobox({
  clients,
  selectedId,
  onSelect,
  placeholder = "Pick a client…",
}: {
  clients: Opt[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selName = useMemo(
    () => (selectedId ? clients.find((c) => c.id === selectedId)?.name ?? "" : ""),
    [selectedId, clients]
  );

  // Reflect external selection changes (e.g. cleared by a filter chip, or set).
  useEffect(() => {
    setText(selName);
  }, [selName]);

  const options = useMemo(() => {
    const q = text.trim().toLowerCase();
    // While a client is selected the box shows its name; treat that as "show all"
    // so the dropdown lets you pick a different client.
    const effective = q === selName.trim().toLowerCase() ? "" : q;
    // Show every match and let the dropdown scroll (it has max-h + overflow).
    // Capping the list hid most clients even though the box could scroll.
    return effective === ""
      ? clients
      : clients.filter((c) => c.name.toLowerCase().includes(effective));
  }, [clients, text, selName]);

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(o: Opt) {
    onSelect(o.id);
    setText(o.name);
    setOpen(false);
  }

  function clear() {
    onSelect(null);
    setText("");
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (open && options[highlight]) {
        e.preventDefault();
        choose(options[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative w-64">
      <input
        type="text"
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          setOpen(true);
          setHighlight(0);
          if (v.trim() === "") onSelect(null); // emptying the box clears the filter
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 pr-8 text-sm placeholder:text-slate-400 focus:border-brand focus:outline-none"
      />
      {selectedId || text ? (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear selection"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          ×
        </button>
      ) : (
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
          ▾
        </span>
      )}

      {open && options.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {options.map((o, i) => (
            <li key={o.id}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(o)}
                className={`block w-full px-3 py-1.5 text-left text-sm ${
                  i === highlight ? "bg-brand text-white" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {o.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
