import type { Metadata } from "next";
import "./globals.css";
import { TranslatorProvider } from "@/components/translator";

export const metadata: Metadata = {
  title: "VEXO Studio",
  description: "AI-powered video production platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <TranslatorProvider>{children}</TranslatorProvider>
      </body>
    </html>
  );
}
