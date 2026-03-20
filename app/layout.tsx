import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Stock Dashboard",
  description: "A personal-first stock dashboard with editable targets and live market metrics."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
