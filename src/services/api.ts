import { API_BASE_URL } from "../config/api";
import type { Product } from "../types/product";

export async function getProducts(): Promise<Product[]> {
  const response = await fetch(\`\${API_BASE_URL}/api/products\`);
  if (!response.ok) {
    throw new Error("Unable to load products");
  }
  return response.json();
}