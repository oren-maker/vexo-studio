import type { Metadata } from "next";
import "./globals.css";
import { TranslatorProvider } from "@/components/translator";
import { DomTranslator } from "@/components/dom-translator";

export const metadata: Metadata = {
  title: "VEXO Studio",
  description: "AI-powered video production platform",
  // Tell Chrome / Edge / Firefox auto-translators to skip this page entirely.
  // Content is already rendered in the user's chosen language via useLang();
  // re-translating Hebrew→Hebrew was mangling strings (EP06 → פורטוגזית06,
  // הסצנה → הסצ).
  other: { google: "notranslate" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" translate="no" className="notranslate">
      <body className="antialiased">
        <TranslatorProvider>
          <DomTranslator />
          {children}
        </TranslatorProvider>
      </body>
    </html>
  );
}
