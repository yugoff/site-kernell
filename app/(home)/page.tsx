import { Cases } from "@/components/home/cases";
import { Chrome } from "@/components/home/chrome";
import { DocCheck } from "@/components/home/doc-check";
import { Hero } from "@/components/home/hero";
import { Outro } from "@/components/home/outro";
import { Proof } from "@/components/home/proof";
import { RagChat } from "@/components/home/rag-chat";
import { Route } from "@/components/home/route";

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
