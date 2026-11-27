import { ApiError, apiError, rateLimit } from "@cloud/lib/auth";
import {
  catalogCategories,
  getAllCatalogs,
  getCatalogByCategory,
  type CatalogCategory,
} from "@cloud/lib/catalog-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await rateLimit("catalog:read", 120, 60_000);
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || "all";

    if (category === "all") {
      const catalogs = await getAllCatalogs();
      return Response.json(
        { category: "all", catalogs },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!catalogCategories.includes(category as CatalogCategory)) {
      throw new ApiError(400, "Неизвестная категория каталога.");
    }

    const data = await getCatalogByCategory(category as CatalogCategory);
    return Response.json(
      { category, ...data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

