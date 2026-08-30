import "./globals.css";

export const metadata = {
  title: "Bench Cloud",
  description: "Multi-provider agentic job runner with persistent, scheduled jobs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-full bg-slate-950">{children}</body>
    </html>
  );
}
