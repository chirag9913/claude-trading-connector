import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Claude Trading Dashboard",
  description: "Live paper/demo trading dashboard for Indian markets (NSE/BSE + CDS).",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="header">
          <h1>📊 Claude Trading · India</h1>
          <span className="badge paper">PAPER / DEMO · NSE + BSE + CDS</span>
        </div>
        {children}
      </body>
    </html>
  );
}
