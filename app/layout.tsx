import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "@/components/I18nProvider";
import GlobalRuntimeErrorReporter from "@/components/GlobalRuntimeErrorReporter";

export const metadata: Metadata = {
  title: "Pi Agent Desktop",
  description: "Pi Coding Agent Desktop Application",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("pi-theme");if(t==="dark")document.documentElement.classList.add("dark")}catch(e){}})();`,
          }}
        />
      </head>
      <body style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
        <I18nProvider>
          {/* Window-level unhandledrejection/error net; inside the provider so the toast copy can be translated. */}
          <GlobalRuntimeErrorReporter />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
