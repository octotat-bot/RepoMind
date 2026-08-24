import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Container } from "@/components/landing/section";
import { Wordmark } from "@/components/landing/wordmark";
import { SAMPLE_REPOSITORIES } from "@/lib/constants";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "#features", label: "Features" },
      { href: "#pipeline", label: "How it works" },
      { href: "#stack", label: "Tech stack" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/register", label: "Create an account" },
      { href: "/dashboard", label: "Dashboard" },
    ],
  },
  {
    title: "Good first repos",
    links: SAMPLE_REPOSITORIES.map((repo) => ({
      href: repo.url,
      label: repo.name,
      external: true,
    })),
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <Container className="py-14">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Wordmark />
            <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-ink-subtle">
              Retrieval-augmented codebase intelligence. Local models, real citations, no
              guessing.
            </p>
            <p className="mt-4 max-w-xs text-[12px] leading-relaxed text-ink-faint">
              A portfolio project — built to be read as carefully as it is used. Not affiliated
              with GitHub or Ollama.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint">
                {column.title}
              </p>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <FooterLink {...link} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-2 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-ink-faint">
            © {new Date().getFullYear()} RepoMind
          </p>
          <p className="font-mono text-[11px] text-ink-faint">
            Next.js · FastAPI · LangChain · FAISS · Ollama
          </p>
        </div>
      </Container>
    </footer>
  );
}

function FooterLink({ href, label, external = false }) {
  const className =
    "inline-flex items-center gap-1 text-[13px] text-ink-subtle transition-colors hover:text-ink";

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {label}
        <ArrowUpRight className="h-3 w-3" aria-hidden />
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}
