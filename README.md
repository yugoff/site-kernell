# Kernell — сайт

Next.js 16 + Tailwind CSS 4, статический экспорт.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # статика в ./out
```

## Деплой на GitHub Pages

1. Создайте репозиторий и запушьте код в ветку `main`.
2. В репозитории: Settings → Pages → Source: **GitHub Actions**.
3. Каждый push в `main` запускает `.github/workflows/deploy.yml`, который собирает сайт и публикует его.

`basePath` (для адреса вида `user.github.io/repo`) подставляется автоматически.
Локально можно проверить так: `BASE_PATH=/repo npm run build`.
