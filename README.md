# Kernell — сайт

Next.js 16 + Tailwind CSS 4, статический экспорт.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # статика в ./out
```

## Структура

- `/` — основной сайт с интерактивными секциями и анимациями GSAP: `app/(home)`.
- Компоненты и стили главной — в `components/home`.
- Тексты, кейсы и цифры — в `lib/site-content.ts`.
- Контакты и реквизиты — в `lib/contact.ts`.
