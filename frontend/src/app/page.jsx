import { ClosingCta } from "@/components/landing/closing-cta";
import { FeatureGrid } from "@/components/landing/feature-grid";
import { Hero } from "@/components/landing/hero";
import { PipelineDiagram } from "@/components/landing/pipeline-diagram";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteNav } from "@/components/landing/site-nav";
import { TechStrip } from "@/components/landing/tech-strip";

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-canvas">
      <SiteNav />
      <main>
        <Hero />
        <FeatureGrid />
        <PipelineDiagram />
        <TechStrip />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  );
}
