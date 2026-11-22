export const plans = [
  {
    id: "start",
    name: "Старт",
    cpu: 1,
    ram: 2,
    disk: 25,
    price: 490,
    description: "Для первого проекта и небольшого бота",
  },
  {
    id: "project",
    name: "Проект",
    cpu: 2,
    ram: 4,
    disk: 50,
    price: 890,
    description: "Для сайта, приложения или рабочего API",
    popular: true,
  },
  {
    id: "business",
    name: "Бизнес",
    cpu: 4,
    ram: 8,
    disk: 100,
    price: 1690,
    description: "Когда проекту нужно больше ресурсов",
  },
  {
    id: "scale",
    name: "Масштаб",
    cpu: 8,
    ram: 16,
    disk: 200,
    price: 3290,
    description: "Для нескольких сервисов и больших задач",
  },
] as const;

// Illustrative retail prices, not a provider quote. Live purchases stay disabled.
export const zones = [
  { zone: "ru", registration: 390, renewal: 690 },
  { zone: "рф", registration: 390, renewal: 690 },
  { zone: "com", registration: 2190, renewal: 2690 },
  { zone: "net", registration: 1890, renewal: 2390 },
] as const;

export const operatingSystems = ["Ubuntu 24.04", "Debian 12", "AlmaLinux 9"];
export const locations = ["Москва", "Санкт-Петербург"];
export const sections = [
  "overview",
  "servers",
  "domains",
  "billing",
  "orders",
  "settings",
  "support",
] as const;
export type Section = (typeof sections)[number];
export const sectionNames: Record<Section, string> = {
  overview: "Обзор",
  servers: "Серверы",
  domains: "Домены",
  billing: "Финансы",
  orders: "Заказы",
  settings: "Настройки",
  support: "Поддержка",
};
export function money(value: number) {
  return (
    new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value) +
    " ₽"
  );
}
export function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Yekaterinburg",
  });
}

export type User = { id: string; name: string; email: string; demo: boolean };
export type Service = {
  id: string;
  kind: "vps" | "domain";
  name: string;
  status: "running" | "stopped" | "active";
  price: number;
  renewal: string;
  details: string;
  address: string;
  autoRenew: boolean;
};
export type Order = {
  id: string;
  title: string;
  amount: number;
  created: string;
  status: string;
};
export type Activity = { id: number; title: string; created: string };
export type Account = {
  user: User;
  services: Service[];
  orders: Order[];
  activity: Activity[];
  balance: number;
};
