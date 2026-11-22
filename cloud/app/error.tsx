"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="wrap not-found">
      <h1>Не удалось загрузить страницу.</h1>
      <p>
        Попробуйте ещё раз. Если ошибка повторяется, напишите info@kernell.ru.
      </p>
      <button onClick={reset} className="button button-accent">
        Повторить
      </button>
    </main>
  );
}
