"use client";

import { useEffect, useMemo, useState } from "react";

type Product = {
  id: number | string;
  name: string;
  category?: string;
  description?: string;
  image_url?: string;
  price: number | string;
  unit?: string;
  is_available?: boolean;
  coming_soon?: boolean;
  shop_name?: string;
};

const API_BASE = (process.env.NEXT_PUBLIC_VEGZ_API_URL || "http://localhost:8003").replace(/\/$/, "");

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE}/api/products`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
        return response.json() as Promise<Product[]>;
      })
      .then((items) => setProducts(Array.isArray(items) ? items : []))
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name !== "AbortError") {
          setError("We couldn't load the live catalog. Check that the Vegz API is running.");
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(products.map((product) => product.category).filter((value): value is string => Boolean(value))))],
    [products],
  );
  const visibleProducts = category === "All" ? products : products.filter((product) => product.category === category);
  const total = visibleProducts.reduce((sum, product) => sum + Number(product.price || 0) * (quantities[String(product.id)] || 0), 0);
  const itemCount = Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);

  return (
    <main className="store-shell">
      <header className="store-header">
        <a className="brand" href="/" aria-label="Vegz home"><span className="brand-mark">V</span><span>vegz<span className="brand-period">.</span></span></a>
        <span className="delivery-pill"><span className="live-dot" /> Fresh vegetables & groceries</span>
        <a className="basket-link" href="#basket">Basket <strong>{itemCount}</strong></a>
      </header>

      <section className="store-hero">
        <div className="hero-copy">
          <p className="eyebrow">YOUR NEIGHBOURHOOD, DELIVERED</p>
          <h1>Fresh market finds.<br /><span>Right to your door.</span></h1>
          <p>Shop vegetables and everyday groceries from local stores in your city. One basket, simple ordering.</p>
          <a className="primary-link" href="#catalog">Explore the market <span aria-hidden="true">↓</span></a>
        </div>
        <div className="market-art" role="img" aria-label="Fresh vegetables and grocery market illustration">
          <div className="market-sun" /><div className="market-bag">🥬<span>🥕</span><span>🍅</span><span>🥦</span></div>
          <div className="market-caption"><strong>Picked nearby</strong><span>Delivered with care</span></div>
        </div>
      </section>

      <section id="catalog" className="catalog-section">
        <div className="section-heading"><div><p className="eyebrow">THE DAILY MARKET</p><h2>What are we cooking?</h2></div><span className="catalog-count">{products.length} items</span></div>
        <nav className="category-row" aria-label="Product categories">
          {categories.map((value) => <button key={value} className={category === value ? "category active" : "category"} onClick={() => setCategory(value)}>{value}</button>)}
        </nav>

        {loading && <p className="feedback">Loading fresh picks…</p>}
        {error && <div className="feedback error" role="alert">{error}<button onClick={() => window.location.reload()}>Try again</button></div>}
        {!loading && !error && visibleProducts.length === 0 && <p className="feedback">No products in this category yet. Please check back soon.</p>}

        <div className="product-grid">
          {visibleProducts.map((product) => {
            const id = String(product.id);
            const quantity = quantities[id] || 0;
            const unavailable = product.is_available === false || product.coming_soon === true;
            return <article className="product-card" key={id}>
              <div className="product-image">
                {product.image_url ? <img src={product.image_url} alt={product.name} loading="lazy" /> : <div className="image-placeholder">🥦</div>}
                {product.coming_soon && <span className="product-badge">Coming soon</span>}
              </div>
              <div className="product-info"><span className="product-category">{product.category || "Market fresh"}</span><h3>{product.name}</h3><p className="product-shop">{product.shop_name || "Local Vegz market"}</p>
                <div className="product-bottom"><div><strong>₹{Number(product.price || 0).toFixed(2)}</strong><span> / {product.unit || "item"}</span></div>
                  {unavailable ? <span className="unavailable">Coming soon</span> : quantity === 0 ? <button className="add-button" onClick={() => setQuantities((old) => ({ ...old, [id]: 1 }))}>+ Add</button> : <div className="quantity-control"><button aria-label={`Remove one ${product.name}`} onClick={() => setQuantities((old) => ({ ...old, [id]: Math.max(0, quantity - 1) }))}>−</button><span>{quantity}</span><button aria-label={`Add one ${product.name}`} onClick={() => setQuantities((old) => ({ ...old, [id]: quantity + 1 }))}>+</button></div>}
                </div>
              </div>
            </article>;
          })}
        </div>
      </section>

      <aside id="basket" className="basket-summary"><div><p className="eyebrow">YOUR BASKET</p><strong>{itemCount} {itemCount === 1 ? "item" : "items"} selected</strong><span>Checkout and address flow are the next integration milestone.</span></div><div className="basket-total"><span>Estimated total</span><strong>₹{total.toFixed(2)}</strong></div></aside>
      <footer className="store-footer"><strong>vegz.</strong><span>Fresh choices. Smarter delivery.</span><span>Serving Hubli & Dharwad first</span></footer>
    </main>
  );
}
