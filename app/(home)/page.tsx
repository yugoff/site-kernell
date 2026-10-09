import { Cases } from "@/components/v3/cases";
import { Chrome } from "@/components/v3/chrome";
import { DocCheck } from "@/components/v3/doc-check";
import { Hero } from "@/components/v3/hero";
import { Outro } from "@/components/v3/outro";
import { Proof } from "@/components/v3/proof";
import { RagChat } from "@/components/v3/rag-chat";
import { Route } from "@/components/v3/route";

export default function HomePage() {
  return (
    <>
      <a className="skip-link" href="#main">
        к содержимому
      </a>
      <Chrome />
      <main id="main">
        <Hero />
        <DocCheck />
        <RagChat />
        <Route />
        <Cases />
        <Proof />
        <Outro />
      </main>
    </>
  );
}
