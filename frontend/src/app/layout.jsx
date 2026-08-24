import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { ColdStartNotice } from "@/components/layout/cold-start-notice";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  title: {
    default: "RepoMind — AI codebase intelligence",
    template: "%s · RepoMind",
  },
  description:
    "Import any GitHub repository and ask questions about it. Retrieval-augmented answers grounded in the real source, with exact file and line citations. Runs entirely on local models.",
  keywords: ["RAG", "codebase", "AI", "FAISS", "Ollama", "code search", "developer tools"],
  authors: [{ name: "RepoMind" }],
  openGraph: {
    title: "RepoMind — AI codebase intelligence",
    description:
      "Chat with any GitHub repository. Grounded answers with file-level citations, powered by local models.",
    type: "website",
  },
};

export const viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <ColdStartNotice />
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#111111",
              border: "1px solid #222222",
              color: "#fafafa",
              borderRadius: "14px",
            },
          }}
        />
      </body>
    </html>
  );
}
