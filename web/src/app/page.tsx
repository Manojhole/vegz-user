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
  stock_qty?: number;
  shop_id?: number | null;
  shop_name?: string;
};
type Address = {
  id: number; label: string; recipient_name: string; phone: string; line1: string;
  line2: string; landmark: string; city: string; state: string; postal_code: string; is_default: boolean;
};
type Customer = { id: number; phone: string; full_name?: string | null };
type CustomerOrder = { id: number; tracking_code: string; total_amount: number; status: string; payment_status: string; created_at: string };
type ApiError = { detail?: string };

const API_BASE = (process.env.NEXT_PUBLIC_VEGZ_API_URL || "http://localhost:8003").replace(/\/$/, "");
const EMPTY_ADDRESS = { label:"Home", recipient_name:"", phone:"", line1:"", line2:"", landmark:"", city:"Hubli", state:"Karnataka", postal_code:"", is_default:true };

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [category, setCategory] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState("recommended");
  const [city, setCity] = useState("Hubli");
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [demoOtp, setDemoOtp] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [token, setToken] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "online">("cod");
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [orderNotice, setOrderNotice] = useState("");
  const [deliveryFee, setDeliveryFee] = useState(25);
  const [freeDeliveryMinimum, setFreeDeliveryMinimum] = useState(499);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE}/api/products?city=${encodeURIComponent(city)}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
        return response.json() as Promise<Product[]>;
      })
      .then((items) => setProducts(Array.isArray(items) ? items : []))
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name !== "AbortError") setCatalogError("We couldn't load the live catalog. Check that the Vegz API is running.");
      })
      .finally(() => setLoading(false));
    fetch(`${API_BASE}/api/store-config`)
      .then((r) => r.ok ? r.json() : null)
      .then((config) => { if (config) { setDeliveryFee(Number(config.delivery_fee ?? 25)); setFreeDeliveryMinimum(Number(config.free_delivery_minimum ?? 499)); } })
      .catch(() => undefined);
    const savedToken = typeof window !== "undefined" ? window.sessionStorage.getItem("vegz-customer-token") || "" : "";
    if (savedToken) {
      setToken(savedToken);
      void loadAccount(savedToken, false);
    }
    return () => controller.abort();
  }, [city]);

  async function api<T>(path: string, session = "", init: RequestInit = {}): Promise<T> {
    const response = await fetch(API_BASE + path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session}` } : {}), ...(init.headers || {}) },
    });
    const data = await response.json().catch(() => ({} as ApiError));
    if (!response.ok) throw new Error((data as ApiError).detail || `Request failed (${response.status})`);
    return data as T;
  }

  async function loadAccount(session: string, updateToken = true) {
    try {
      const [me, savedAddresses, recentOrders] = await Promise.all([
        api<Customer>("/api/me", session),
        api<Address[]>("/api/addresses", session),
        api<CustomerOrder[]>("/api/orders", session),
      ]);
      setCustomer(me); setAddresses(savedAddresses); setOrders(recentOrders);
      if (!selectedAddressId) setSelectedAddressId(savedAddresses.find((item) => item.is_default)?.id ?? savedAddresses[0]?.id ?? null);
      if (updateToken) setToken(session);
    } catch {
      if (typeof window !== "undefined") window.sessionStorage.removeItem("vegz-customer-token");
      setToken(""); setCustomer(null);
    }
  }

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(products.map((product) => product.category).filter((value): value is string => Boolean(value))))],
    [products],
  );
  const visibleProducts = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase();
    const filtered = products.filter((product) =>
      (category === "All" || product.category === category) &&
      (!term || `${product.name} ${product.category || ""} ${product.shop_name || ""}`.toLocaleLowerCase().includes(term))
    );
    return filtered.sort((a, b) => {
      if (sortOrder === "price-low") return Number(a.price) - Number(b.price) || a.name.localeCompare(b.name);
      if (sortOrder === "price-high") return Number(b.price) - Number(a.price) || a.name.localeCompare(b.name);
      if (sortOrder === "name") return a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [products, category, searchTerm, sortOrder]);
  const basketItems = products.filter((product) => (quantities[String(product.id)] || 0) > 0);
  const subtotal = basketItems.reduce((sum, product) => sum + Number(product.price || 0) * (quantities[String(product.id)] || 0), 0);
  const itemCount = Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);
  const appliedDeliveryFee = subtotal >= freeDeliveryMinimum || subtotal === 0 ? 0 : deliveryFee;
  const total = subtotal + appliedDeliveryFee;

  async function requestCode() {
    setRequestBusy(true); setCheckoutError("");
    try {
      const response = await api<{ message: string; demo_otp?: string }>("/api/auth/request-otp", "", { method:"POST", body:JSON.stringify({ phone }) });
      setOtpSent(true); setDemoOtp(response.demo_otp || "");
      if (response.demo_otp) setOtp(response.demo_otp);
    } catch(e) { setCheckoutError(e instanceof Error ? e.message : "Could not request a verification code."); }
    finally { setRequestBusy(false); }
  }

  async function verifyCode() {
    setRequestBusy(true); setCheckoutError("");
    try {
      const response = await api<{ access_token: string; user: Customer }>("/api/auth/verify-otp", "", { method:"POST", body:JSON.stringify({ phone, otp }) });
      if (typeof window !== "undefined") window.sessionStorage.setItem("vegz-customer-token", response.access_token);
      setToken(response.access_token); setCustomer(response.user);
      await loadAccount(response.access_token);
      setAddress((old) => ({...old, phone: response.user.phone, recipient_name: response.user.full_name || ""}));
    } catch(e) { setCheckoutError(e instanceof Error ? e.message : "The code could not be verified."); }
    finally { setRequestBusy(false); }
  }

  async function saveAddress(): Promise<number> {
    if (!token) throw new Error("Verify your phone before saving a delivery address.");
    const saved = await api<Address>("/api/addresses", token, { method:"POST", body:JSON.stringify(address) });
    setAddresses((old) => [saved, ...old.filter((item) => item.id !== saved.id)]);
    setSelectedAddressId(saved.id);
    return saved.id;
  }

  async function placeOrder() {
    if (!token) { setCheckoutError("Verify your mobile number to continue."); return; }
    if (!basketItems.length) { setCheckoutError("Add products to your basket first."); return; }
    if (!["hubli","dharwad"].includes(address.city.trim().toLowerCase()) && !selectedAddressId) {
      setCheckoutError(`Vegz is coming soon to ${address.city}. We currently deliver only in Hubli and Dharwad.`); return;
    }
    setRequestBusy(true); setCheckoutError(""); setOrderNotice("");
    try {
      const addressId = selectedAddressId ?? await saveAddress();
      const items = basketItems.map((product) => ({
        product_id: Number(product.id),
        ...(product.shop_id != null ? { shop_id: Number(product.shop_id) } : {}),
        quantity: quantities[String(product.id)],
      }));
      if (items.some((item) => !Number.isInteger(item.product_id))) throw new Error("Please refresh the catalog before ordering.");
      const result = await api<CustomerOrder>("/api/orders", token, { method:"POST", body:JSON.stringify({ address_id:addressId, payment_method:paymentMethod, items }) });
      setOrderNotice(`Order ${result.tracking_code} placed. Status: ${result.status.replace(/_/g," ")}.${paymentMethod==="online"?" Online payment is pending gateway integration; no money has been collected.":""}`);
      setQuantities({}); setCheckoutOpen(false);
      const recent = await api<CustomerOrder[]>("/api/orders", token);
      setOrders(recent);
      window.location.hash = "orders";
    } catch(e) { setCheckoutError(e instanceof Error ? e.message : "Order could not be placed."); }
    finally { setRequestBusy(false); }
  }

  function setQty(product: Product, next: number) {
    const id = String(product.id);
    const maximum = Math.min(99, product.stock_qty ?? 99);
    setQuantities((old) => ({ ...old, [id]: Math.max(0, Math.min(maximum, next)) }));
  }

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
        <div className="section-heading"><div><p className="eyebrow">YOUR DELIVERY CITY</p><h2>Shop your neighbourhood</h2></div></div>
        <nav className="category-row" aria-label="Delivery city">
          {["Hubli","Dharwad"].map((value)=><button key={value} className={city===value?"category active":"category"} onClick={()=>{setCity(value);setLoading(true);setCatalogError("");}}>{value}</button>)}
        </nav>
        <div className="section-heading"><div><p className="eyebrow">THE DAILY MARKET</p><h2>What are we cooking?</h2></div><span className="catalog-count">{products.length} items</span></div>
        <div className="catalog-tools">
          <label className="catalog-search"><span className="sr-only">Search products</span><span aria-hidden="true">⌕</span><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search vegetables, groceries…" /></label>
          <label className="catalog-sort"><span>Sort</span><select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} aria-label="Sort products"><option value="recommended">Recommended</option><option value="name">Name A–Z</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label>
        </div>
        <nav className="category-row" aria-label="Product categories">
          {categories.map((value) => <button key={value} className={category === value ? "category active" : "category"} onClick={() => setCategory(value)}>{value}</button>)}
        </nav>

        {loading && <p className="feedback">Loading fresh picks…</p>}
        {catalogError && <div className="feedback error" role="alert">{catalogError}<button onClick={() => window.location.reload()}>Try again</button></div>}
        {!loading && !catalogError && visibleProducts.length === 0 && <p className="feedback">No products in this category yet. Please check back soon.</p>}

        <div className="product-grid">
          {visibleProducts.map((product) => {
            const id = String(product.id);
            const quantity = quantities[id] || 0;
            const unavailable = product.shop_id == null || (product.stock_qty ?? 0) <= 0;
            return <article className="product-card" key={id}>
              <div className="product-image">
                {product.image_url ? <img src={product.image_url} alt={product.name} loading="lazy" /> : <div className="image-placeholder">🥦</div>}
                {unavailable && <span className="product-badge">Coming soon</span>}
              </div>
              <div className="product-info"><span className="product-category">{product.category || "Market fresh"}</span><h3>{product.name}</h3><p className="product-shop">{product.shop_name || "Local Vegz market"}</p>
                <div className="product-bottom"><div><strong>₹{Number(product.price || 0).toFixed(2)}</strong><span> / {product.unit || "item"}</span></div>
                  {unavailable ? <span className="unavailable">Coming soon</span> : quantity === 0 ? <button className="add-button" onClick={() => setQty(product,1)}>+ Add</button> : <div className="quantity-control"><button aria-label={`Remove one ${product.name}`} onClick={() => setQty(product,quantity-1)}>−</button><span>{quantity}</span><button aria-label={`Add one ${product.name}`} disabled={quantity >= Math.min(99,product.stock_qty ?? 99)} onClick={() => setQty(product,quantity+1)}>+</button></div>}
                </div>
              </div>
            </article>;
          })}
        </div>
      </section>

      <aside id="basket" className="basket-summary">
        <div><p className="eyebrow">YOUR BASKET</p><strong>{itemCount} {itemCount === 1 ? "item" : "items"} selected</strong><span>{subtotal >= freeDeliveryMinimum ? "Free delivery unlocked." : `Delivery ₹${appliedDeliveryFee.toFixed(2)} · Free above ₹${freeDeliveryMinimum.toFixed(0)}`}</span></div>
        <div className="basket-total"><span>Estimated total</span><strong>₹{total.toFixed(2)}</strong><button className="primary-link" disabled={itemCount===0} onClick={()=>{setCheckoutError("");setCheckoutOpen(true);}}>Proceed to checkout →</button></div>
      </aside>

      {checkoutOpen && <section className="checkout-panel" aria-labelledby="checkout-title">
        <div className="checkout-heading"><div><p className="eyebrow">SECURE CHECKOUT</p><h2 id="checkout-title">Your fresh order</h2></div><button className="close-button" onClick={()=>setCheckoutOpen(false)} aria-label="Close checkout">×</button></div>
        <div className="checkout-columns">
          <div className="checkout-main">
            {!token ? <div className="checkout-card"><h3>Verify your mobile number</h3><p className="checkout-muted">We use a one-time code to attach your order to your account.</p>
              <label>Mobile number</label><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+91 98765 43210" inputMode="tel"/>
              {!otpSent ? <button className="primary-link" disabled={requestBusy||phone.trim().length<10} onClick={requestCode}>{requestBusy?"Sending…":"Send verification code"}</button> : <><label>6-digit verification code</label><input value={otp} onChange={e=>setOtp(e.target.value)} placeholder="123456" inputMode="numeric" maxLength={6}/>{demoOtp&&<p className="demo-otp">Local development code: <strong>{demoOtp}</strong></p>}<button className="primary-link" disabled={requestBusy||otp.length!==6} onClick={verifyCode}>{requestBusy?"Verifying…":"Verify and continue"}</button></>}
            </div> : <div className="checkout-card"><h3>Delivery details</h3><p className="checkout-muted">Signed in as {customer?.phone || phone}. Only Hubli and Dharwad are currently served.</p>
              {addresses.length>0&&<><label>Saved delivery address</label><select value={selectedAddressId??""} onChange={e=>setSelectedAddressId(e.target.value?Number(e.target.value):null)}><option value="">Add a new address</option>{addresses.map(item=><option key={item.id} value={item.id}>{item.label}: {item.line1}, {item.city}</option>)}</select></>}
              {!selectedAddressId&&<div className="address-fields">
                <label>Recipient name</label><input value={address.recipient_name} onChange={e=>setAddress({...address,recipient_name:e.target.value})} placeholder="Full name"/>
                <label>Contact phone</label><input value={address.phone} onChange={e=>setAddress({...address,phone:e.target.value})} placeholder="+91 mobile number" inputMode="tel"/>
                <label>Address line</label><input value={address.line1} onChange={e=>setAddress({...address,line1:e.target.value})} placeholder="Flat, house, street"/>
                <label>Landmark (optional)</label><input value={address.landmark} onChange={e=>setAddress({...address,landmark:e.target.value})} placeholder="Near…"/>
                <label>City</label><input value={address.city} onChange={e=>setAddress({...address,city:e.target.value})} placeholder="Hubli or Dharwad"/>
                {!["hubli","dharwad"].includes(address.city.trim().toLowerCase())&&<p className="coming-soon-city">Vegz is coming soon to {address.city || "your city"}. Delivery is currently available only in Hubli and Dharwad.</p>}
                <div className="address-two"><div><label>State</label><input value={address.state} onChange={e=>setAddress({...address,state:e.target.value})} placeholder="Karnataka"/></div><div><label>PIN code</label><input value={address.postal_code} onChange={e=>setAddress({...address,postal_code:e.target.value})} placeholder="580001" inputMode="numeric"/></div></div>
              </div>}
              <label>Payment method</label><div className="payment-choices"><button className={paymentMethod==="cod"?"payment-choice selected":"payment-choice"} onClick={()=>setPaymentMethod("cod")}>Cash on delivery</button><button className={paymentMethod==="online"?"payment-choice selected":"payment-choice"} onClick={()=>setPaymentMethod("online")}>Online payment <small>Coming soon</small></button></div>
              {paymentMethod==="online"&&<p className="checkout-muted">This records the order as payment pending. No payment will be collected until a gateway is integrated.</p>}
              <button className="primary-link" disabled={requestBusy||!basketItems.length||(!selectedAddressId&&(!address.recipient_name.trim()||!address.phone.trim()||address.line1.trim().length<4||address.postal_code.trim().length<4||!["hubli","dharwad"].includes(address.city.trim().toLowerCase())))} onClick={placeOrder}>{requestBusy?"Placing order…":"Place order · ₹"+total.toFixed(2)}</button>
              <button className="text-link" onClick={async()=>{if(!token)return;await loadAccount(token);}}>Refresh saved addresses and orders</button>
            </div>}
          </div>
          <aside className="checkout-card order-summary"><h3>Order summary</h3>{basketItems.map(item=><div key={item.id} className="summary-line"><span>{item.name} × {quantities[String(item.id)]}</span><strong>₹{(Number(item.price)*quantities[String(item.id)]).toFixed(2)}</strong></div>)}<div className="summary-line"><span>Delivery fee</span><strong>{appliedDeliveryFee===0?"FREE":"₹"+appliedDeliveryFee.toFixed(2)}</strong></div><div className="summary-total"><span>Total</span><strong>₹{total.toFixed(2)}</strong></div></aside>
        </div>
        {checkoutError&&<p className="feedback error" role="alert">{checkoutError}</p>}
      </section>}

      <section id="orders" className="orders-section"><div className="section-heading"><div><p className="eyebrow">ORDER HISTORY</p><h2>Your Vegz orders</h2></div>{token&&<button className="category" onClick={()=>void loadAccount(token)}>Refresh orders</button>}</div>
        {orderNotice&&<p className="feedback" role="status">{orderNotice}</p>}
        {!token?<p className="feedback">Sign in during checkout to view your order history.</p>:orders.length===0?<p className="feedback">No orders yet. Your order status will appear here after placing an order.</p>:<div className="orders-grid">{orders.map(order=><article className="order-history-card" key={order.id}><div><span className="product-category">{order.tracking_code}</span><strong>₹{Number(order.total_amount).toFixed(2)}</strong></div><p>Status: <b>{order.status.replace(/_/g," ")}</b></p><p>Payment: {order.payment_status.replace(/_/g," ")}</p><small>{new Date(order.created_at).toLocaleString()}</small></article>)}</div>}
      </section>
      <footer className="store-footer"><strong>vegz.</strong><span>Fresh choices. Smarter delivery.</span><span>Serving Hubli & Dharwad first</span></footer>
    </main>
  );
}
