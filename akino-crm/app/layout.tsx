import type { Metadata } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans-src",
  subsets: ["latin"],
  display: "swap",
});

const interTight = Inter_Tight({
  variable: "--font-display-src",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rainhub CRM",
  description: "Outbound sales CRM",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`light ${inter.variable} ${interTight.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("akino-theme");if(t==="light"||t==="dark"){document.documentElement.classList.remove("dark","light");document.documentElement.classList.add(t);document.documentElement.style.colorScheme=t}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
