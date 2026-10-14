import type { Metadata } from "next";
import { Chakra_Petch, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const chakra = Chakra_Petch({
  variable: "--font-chakra",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "PokeArmony",
  description: "Analiza la armonía de tu equipo de Pokémon Champions contra el meta vivo.",
  applicationName: "PokeArmony",
  authors: [{ name: "YerayD" }],
  creator: "YerayD",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${chakra.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="aurora" aria-hidden />
        <div className="hud" aria-hidden>
          <svg viewBox="0 0 100 100" fill="none" stroke="currentColor">
            <circle cx="50" cy="50" r="49" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <line x1="0" y1="50" x2="100" y2="50" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <circle cx="50" cy="50" r="11" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <circle cx="50" cy="50" r="6" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        <div className="bezel" aria-hidden />
        {children}
      </body>
    </html>
  );
}
