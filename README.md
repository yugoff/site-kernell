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

## Kernell Cloud

Ветка `cloud-portal` добавляет отдельное серверное приложение для `cloud.kernell.ru`.
Витрина доменов и VPS, регистрация, личный кабинет и изолированное демо находятся в `cloud/`.

```bash
npm run dev:cloud    # http://localhost:3001
npm run build:cloud
npm run test:cloud   # после сборки
npm run start:cloud
```

Платежи и реальные покупки у поставщиков пока не подключены; заказы сохраняются как черновики.
Инструкция по запуску и размещению: [cloud/README.md](cloud/README.md).
