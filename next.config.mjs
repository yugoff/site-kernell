// Статический экспорт для GitHub Pages.
// Для адреса вида user.github.io/repo workflow передаёт BASE_PATH=/repo.
const basePath = process.env.BASE_PATH || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
