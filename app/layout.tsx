import type { Metadata } from "next";
import { Figtree, Fraunces, Geist_Mono } from "next/font/google";
import { PaperGrain } from "@/components/PaperGrain";
import "./globals.css";

// Kiln type (KILN-AGENT §4). tokens.css reads these variables first in --font-display/body/mono.
// Caveat (MarginNote only) is not loaded until a MarginNote with Rayyan's words exists.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT"],
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Protostar",
  description: "Prototype agent spec builder: interview, data gate, cost, tests, blueprint.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${fraunces.variable} ${figtree.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PaperGrain />
        {children}
      </body>
    </html>
  );
}
