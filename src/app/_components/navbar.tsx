"use client";

import Link from "next/link";
import { useState } from "react";

import { api } from "~/trpc/react";

const links = [
  { href: "/", label: "Home" },
  { href: "/schedule", label: "Schedule" },
  { href: "/team", label: "Team" },
];

export function Navbar() {
  const utils = api.useUtils();
  const me = api.auth.me.useQuery();
  const logout = api.auth.logout.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });
  const [loaded, setLoaded] = useState(false);
  const user = me.data;
  const name = user?.name ?? user?.email;

  return (
    <nav className="absolute inset-x-0 top-0 z-10 flex h-[76px] items-center justify-between bg-black px-6 text-white">
      <div className="flex items-center gap-10">
        <Link href="/" className="text-xl font-extrabold">
          EduHack <span className="text-[hsl(280,100%,70%)]">2026</span>
        </Link>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="hidden text-xl hover:text-white/70 md:block">
            {l.label}
          </Link>
        ))}
      </div>
      {user ? (
        <button
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          title="Log out"
          className="flex items-center gap-3 text-left hover:opacity-80 disabled:opacity-50"
        >
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 font-bold">
            {name?.[0]?.toUpperCase()}
            {user.image && (
              // plain img: Google avatar host isn't configured for next/image.
              // Letter shows until the photo has loaded, then the photo covers it.
              <img
                src={user.image}
                alt=""
                referrerPolicy="no-referrer"
                // server-rendered img may finish loading before hydration, so onLoad alone can be missed
                ref={(el) => {
                  if (el?.complete && el.naturalWidth > 0) setLoaded(true);
                }}
                onLoad={() => setLoaded(true)}
                className={`absolute inset-0 h-full w-full rounded-full transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
              />
            )}
          </span>
          <span className="hidden text-sm leading-tight sm:block">
            <span className="block font-medium">{name}</span>
            <span className="block">{user.role}</span>
          </span>
        </button>
      ) : (
        !me.isLoading && (
          <Link href="/login" className="text-xl hover:text-white/70">
            Log in
          </Link>
        )
      )}
    </nav>
  );
}
