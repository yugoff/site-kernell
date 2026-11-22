import Link from "next/link";
import { Header, Footer } from "@cloud/components/ui";
export default function NotFound() {
  return (
    <>
      <Header />
      <main id="main" className="wrap not-found">
        <p className="eyebrow">404 / СТРАНИЦА НЕ НАЙДЕНА</p>
        <h1>
          Кажется, здесь
          <br />
          ещё <em>нет проекта.</em>
        </h1>
        <p>Вернёмся туда, где всё начинается.</p>
        <Link href="/" className="button button-accent">
          На главную
        </Link>
      </main>
      <Footer />
    </>
  );
}
