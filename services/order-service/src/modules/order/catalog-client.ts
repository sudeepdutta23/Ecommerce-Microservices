import { fetchJson } from '@ecom/http';

export interface CatalogProduct {
  id: string;
  name: string;
  priceCents: number;
  currency: string;
  stock: number;
  isActive: boolean;
}

export interface CatalogClient {
  getProductsByIds(ids: string[]): Promise<CatalogProduct[]>;
}

/**
 * The ONLY synchronous dependency the order service has on another service:
 * authoritative price/stock lookup at checkout. Timeout + retry come from the
 * shared client; if the catalog is down, order creation fails fast with 503
 * rather than accepting client-supplied prices.
 */
export class HttpCatalogClient implements CatalogClient {
  constructor(private readonly baseUrl: string) {}

  async getProductsByIds(ids: string[]): Promise<CatalogProduct[]> {
    if (ids.length === 0) return [];
    const url = `${this.baseUrl}/api/v1/products?ids=${ids.join(',')}&limit=${Math.min(ids.length, 100)}`;
    const response = await fetchJson<{ success: boolean; data: { products: CatalogProduct[] } }>(url, {
      timeoutMs: 3000,
      retries: 2,
    });
    return response.data.products;
  }
}
