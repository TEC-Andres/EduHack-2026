import "~/styles/globals.css";

import { type Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";

import { Shell } from "~/app/_components/shell";
import { TRPCReactProvider } from "~/trpc/react";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = {
  title: "ZenSprint — proyectos con IA",
  description: "Gestión de proyectos académicos con Scrum, rúbricas y Gemini",
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const display = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument-serif" });

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Awaited so the user is in the first HTML: the nav renders filled in, no client fetch wait.
  await api.auth.me.prefetch();

  return (
    <html lang="es" className={`${geist.variable} ${geistMono.variable} ${display.variable}`}>
      <body>
        <TRPCReactProvider>
          <HydrateClient>
            {/* Shell reads search params (active tab) */}
            <Suspense>
              <Shell>{children}</Shell>
            </Suspense>
          </HydrateClient>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
