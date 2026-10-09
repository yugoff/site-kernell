# Kernell — сайт

Next.js 16 + Tailwind CSS 4, статический экспорт.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # статика в ./out
```

## Версии

- `/` — основная, интерактивная версия (GSAP): `app/(home)`, компоненты в `components/v3`.
- `/v1/` — прежний сайт, `/v2/` — версия в стиле brag, `/v3/` — то же, что главная.
  Все три закрыты от индексации и не связаны ссылками с главной.
- Тексты, кейсы и цифры для `/`, `/v2/`, `/v3/` — в `lib/site-content.ts`.
