import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ModalProvider } from "./components/Modal";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "BetterBankings Software — Cashflow Analysis",
  description:
    "Professional cashflow analysis tool for banking. Compute Installment Cashflow BBI and Installment Interest across granular maturity time buckets.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable}`}>
        <ModalProvider>{children}</ModalProvider>
      </body>
    </html>
  );
}
