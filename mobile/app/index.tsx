import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Image, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

// In Expo Go, use the same LAN host that serves Metro so a physical phone can
// reach the API on the developer's computer. Keep the emulator alias as fallback.
const expoHost = Constants.expoConfig?.hostUri?.split(":")[0];
const detectedApiBase = expoHost ? `http://${expoHost}:8003` : "http://10.0.2.2:8003";
const API_BASE = (process.env.EXPO_PUBLIC_VEGZ_API_URL || detectedApiBase).replace(/\/$/, "");
const PRODUCT_IMAGE_FALLBACKS: Record<string,string> = {
 tomato:"https://images.unsplash.com/photo-1546094096-0df4bcaaa337?auto=format&fit=crop&w=700&q=85", potato:"https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=700&q=85", "red onion":"https://images.unsplash.com/photo-1508747703725-719777637510?auto=format&fit=crop&w=700&q=85", carrot:"https://images.unsplash.com/photo-1445282768818-728615cc910a?auto=format&fit=crop&w=700&q=85", spinach:"https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&w=700&q=85", broccoli:"https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?auto=format&fit=crop&w=700&q=85", cabbage:"https://images.unsplash.com/photo-1594282486552-05f4d1e3d3c9?auto=format&fit=crop&w=700&q=85", ginger:"https://images.unsplash.com/photo-1615485500704-8e990f9900f2?auto=format&fit=crop&w=700&q=85", garlic:"https://images.unsplash.com/photo-1615477550927-6ec8445c4e2d?auto=format&fit=crop&w=700&q=85", "green chilli":"https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?auto=format&fit=crop&w=700&q=85", lemon:"https://images.unsplash.com/photo-1513558161293-caac8ea942c8?auto=format&fit=crop&w=700&q=85", "green capsicum":"https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?auto=format&fit=crop&w=700&q=85"
};
function normalizedImageUrl(url?:string) { if(!url)return ""; if(/^https?:\/\//i.test(url))return url; return API_BASE + (url.startsWith("/") ? url : "/" + url); }
function fallbackProductImage(name:string) { return PRODUCT_IMAGE_FALLBACKS[name.trim().toLowerCase()] || ""; }
function productEmoji(name:string) {
  const key=name.toLowerCase();
  if(key.includes("coconut"))return "🥥";
  if(key.includes("garlic"))return "🧄";
  if(key.includes("ginger"))return "🫚";
  if(key.includes("chilli")||key.includes("pepper"))return "🌶️";
  if(key.includes("onion"))return "🧅";
  if(key.includes("potato"))return "🥔";
  if(key.includes("tomato"))return "🍅";
  if(key.includes("carrot"))return "🥕";
  if(key.includes("lemon"))return "🍋";
  if(key.includes("rice")||key.includes("dal")||key.includes("flour"))return "🌾";
  if(key.includes("spinach")||key.includes("leaf")||key.includes("coriander")||key.includes("mint"))return "🥬";
  return "🥦";
}
type Product = { id: number | string; name: string; category?: string; description?: string; image_url?: string; price: number | string; unit?: string; stock_qty?: number; shop_id?: number | null; shop_name?: string };
type Address = { id: number; label: string; recipient_name: string; phone: string; line1: string; line2: string; landmark: string; city: string; state: string; postal_code: string; is_default: boolean };
type Customer = { id: number; phone: string; full_name?: string | null };
type Order = { id: number; tracking_code: string; total_amount: number; status: string; payment_status: string; created_at: string };
type Json = Record<string, unknown>;
const EMPTY_ADDRESS = {label:"Home",recipient_name:"",phone:"",line1:"",line2:"",landmark:"",city:"Hubli",state:"Karnataka",postal_code:"",is_default:true};

async function api<T>(path: string, token = "", init: RequestInit = {}): Promise<T> {
  const response = await fetch(API_BASE + path, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) } });
  const data = await response.json().catch(() => ({} as Json));
  if (!response.ok) throw new Error(String((data as Json).detail || `Request failed (${response.status})`));
  return data as T;
}

export default function Home() {
  const enter = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<any>(null);
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 460, useNativeDriver: true }).start();
    return () => enter.stopAnimation();
  }, [enter]);

  const [items, setItems] = useState<Product[]>([]);
  const [failedImages, setFailedImages] = useState<Record<string,number>>({});
  const [basketReady, setBasketReady] = useState(false);
  const [basketOpen, setBasketOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [category, setCategory] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState<"recommended" | "name" | "price-low" | "price-high">("recommended");
  const [city, setCity] = useState("Hubli");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [demoOtp, setDemoOtp] = useState("");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [paymentMethod, setPaymentMethod] = useState<"cod"|"online">("cod");
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderNotice, setOrderNotice] = useState("");
  const [deliveryFee, setDeliveryFee] = useState(25);
  const [freeMinimum, setFreeMinimum] = useState(499);

  const loadAccount = useCallback(async (session: string) => {
    try {
      const [me, savedAddresses, savedOrders] = await Promise.all([
        api<Customer>("/api/me", session), api<Address[]>("/api/addresses", session), api<Order[]>("/api/orders", session),
      ]);
      setCustomer(me); setAddresses(savedAddresses); setOrders(savedOrders);
      setSelectedAddressId((current) => current ?? savedAddresses.find((a) => a.is_default)?.id ?? savedAddresses[0]?.id ?? null);
    } catch {
      await SecureStore.deleteItemAsync("vegz-customer-token");
      setToken(""); setCustomer(null);
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    const data = await api<Product[]>("/api/products?city=" + encodeURIComponent(city));
    setItems(Array.isArray(data) ? data : []);
  }, [city]);

  useEffect(() => {
    SecureStore.getItemAsync("vegz-customer-basket").then((saved) => { if (saved) setQty(JSON.parse(saved) as Record<string,number>); }).catch(() => undefined).finally(() => setBasketReady(true));
  }, []);
  useEffect(() => {
    if (basketReady) SecureStore.setItemAsync("vegz-customer-basket", JSON.stringify(qty)).catch(() => undefined);
  }, [qty, basketReady]);

  useEffect(() => {
    loadCatalog().catch((e) => setError(e instanceof Error ? e.message : "Catalog unavailable.")).finally(() => setLoading(false));
    api<{delivery_fee?:number;free_delivery_minimum?:number}>("/api/store-config").then((config) => {
      setDeliveryFee(Number(config.delivery_fee ?? 25)); setFreeMinimum(Number(config.free_delivery_minimum ?? 499));
    }).catch(() => undefined);
    SecureStore.getItemAsync("vegz-customer-token").then(async (saved) => {
      if (saved) { setToken(saved); await loadAccount(saved); }
    }).catch(() => undefined);
  }, [loadAccount, loadCatalog]);

  const categories = useMemo(() => ["All", ...Array.from(new Set(items.map((item) => item.category).filter((v): v is string => Boolean(v))))], [items]);
  const categoryEmoji = (value:string) => {
    const key=value.toLowerCase();
    if(value==="All")return "🛍️";
    if(key.includes("leaf")||key.includes("spinach"))return "🥬";
    if(key.includes("fruit"))return "🍎";
    if(key.includes("grocer")||key.includes("staple"))return "🛒";
    if(key.includes("spice")||key.includes("chilli"))return "🌶️";
    if(key.includes("dairy"))return "🥛";
    return "🥦";
  };
  const visibleItems = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase();
    const filtered = items.filter((item) =>
      (category === "All" || item.category === category) &&
      (!term || `${item.name} ${item.category || ""} ${item.shop_name || ""}`.toLocaleLowerCase().includes(term))
    );
    if (sortOrder === "recommended") return filtered;
    return filtered.sort((a, b) => {
      if (sortOrder === "price-low") return Number(a.price) - Number(b.price) || a.name.localeCompare(b.name);
      if (sortOrder === "price-high") return Number(b.price) - Number(a.price) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [items, category, searchTerm, sortOrder]);
  const basket = items.filter((item) => (qty[String(item.id)] || 0) > 0);
  const count = basket.reduce((sum, item) => sum + (qty[String(item.id)] || 0), 0);
  const subtotal = basket.reduce((sum, item) => sum + Number(item.price || 0) * (qty[String(item.id)] || 0), 0);
  const fee = subtotal === 0 || subtotal >= freeMinimum ? 0 : deliveryFee;
  const total = subtotal + fee;

  function changeQty(item: Product, value: number) {
    const id = String(item.id); const stock = Number(item.stock_qty ?? 0); const max = Math.min(99, stock > 0 ? stock : 99);
    setQty((old) => ({...old,[id]:Math.max(0,Math.min(max,value))}));
  }
  async function requestOtp() {
    setBusy(true); setCheckoutError("");
    try {
      const result = await api<{demo_otp?:string}>("/api/auth/request-otp","",{method:"POST",body:JSON.stringify({phone})});
      setOtpSent(true); setDemoOtp(result.demo_otp || ""); if(result.demo_otp)setOtp(result.demo_otp);
    } catch(e) { setCheckoutError(e instanceof Error?e.message:"Could not request a verification code."); }
    finally { setBusy(false); }
  }
  async function verifyOtp() {
    setBusy(true); setCheckoutError("");
    try {
      const result = await api<{access_token:string;user:Customer}>("/api/auth/verify-otp","",{method:"POST",body:JSON.stringify({phone,otp})});
      await SecureStore.setItemAsync("vegz-customer-token",result.access_token);
      setToken(result.access_token); setCustomer(result.user);
      setAddress((old)=>({...old,phone:result.user.phone,recipient_name:result.user.full_name||""}));
      await loadAccount(result.access_token);
    } catch(e) { setCheckoutError(e instanceof Error?e.message:"Verification failed."); }
    finally { setBusy(false); }
  }
  async function placeOrder() {
    if(!token){setCheckoutError("Verify your phone number first.");return;}
    if(!basket.length){setCheckoutError("Add items to your basket first.");return;}
    if(basket.some((item)=>item.shop_id==null||(item.stock_qty??0)<=0)){
      setCheckoutError("Some items are not yet linked to an approved local shop with available stock. Your basket is saved; choose available shop-listed products to place an order.");
      return;
    }
    if(!selectedAddressId&&!["hubli","dharwad"].includes(address.city.trim().toLowerCase())){setCheckoutError(`Vegz is coming soon to ${address.city}. We currently deliver only in Hubli and Dharwad.`);return;}
    setBusy(true);setCheckoutError("");setOrderNotice("");
    try {
      let addressId=selectedAddressId;
      if(addressId===null){
        const saved=await api<Address>("/api/addresses",token,{method:"POST",body:JSON.stringify(address)});
        addressId=saved.id;setAddresses((old)=>[saved,...old]);
      }
      const orderItems=basket.map((item)=>({product_id:Number(item.id),...(item.shop_id!=null?{shop_id:Number(item.shop_id)}:{}),quantity:qty[String(item.id)]}));
      if(orderItems.some((item)=>!Number.isInteger(item.product_id)))throw new Error("Refresh your basket before ordering.");
      const result=await api<Order>("/api/orders",token,{method:"POST",body:JSON.stringify({address_id:addressId,payment_method:paymentMethod,items:orderItems})});
      setOrderNotice(`Order ${result.tracking_code} placed · ${result.status.replace(/_/g," ")}${paymentMethod==="online"?" · Online payment is still pending gateway integration.":""}`);
      setQty({});setCheckoutOpen(false);await loadAccount(token);
    }catch(e){setCheckoutError(e instanceof Error?e.message:"Order could not be placed.");}
    finally{setBusy(false);}
  }

  useEffect(() => { if (checkoutOpen) requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true })); }, [checkoutOpen]);

  return <SafeAreaView style={s.safe}><Animated.ScrollView ref={scrollRef} style={{ opacity: enter }} contentContainerStyle={[s.page, count > 0 && !checkoutOpen && !basketOpen && s.pageWithBasket]}>
    <View style={s.header}><Text style={s.brand}>vegz<Text style={s.period}>.</Text></Text><Text style={s.basketCount}>{count} in basket</Text></View>
    <Text style={s.eyebrow}>YOUR NEIGHBOURHOOD MARKET</Text><Text style={s.title}>Fresh market finds, delivered.</Text><Text style={s.sub}>Vegetables and everyday groceries from local stores in your city.</Text>
    <View style={s.marketHero}><Text style={s.heroEmoji}>🥬  🥕  🍅</Text><View><Text style={s.heroTitle}>Local stores. One basket.</Text><Text style={s.muted}>Fresh picks from Hubli and Dharwad shops</Text></View></View>
    <View style={s.sectionHead}><Text style={s.sectionTitle}>Delivery city</Text><Text style={s.muted}>Choose at checkout too</Text></View>
    <View style={s.choiceRow}>{["Hubli","Dharwad"].map(value=><Pressable key={value} onPress={()=>{setCity(value);setLoading(true);setError("");}} style={[s.choice,city===value&&s.choiceActive]}><Text style={[s.choiceText,city===value&&s.choiceTextActive]}>{value}</Text></Pressable>)}</View>
    <View style={s.sectionHead}><Text style={s.sectionTitle}>Today's market</Text><Text style={s.muted}>{items.length} products</Text></View>
    <TextInput style={s.searchInput} value={searchTerm} onChangeText={setSearchTerm} placeholder="Search vegetables and groceries…" placeholderTextColor="#718077" accessibilityLabel="Search products"/>
    <View style={s.sortRow}><Text style={s.muted}>Sort by</Text>{([{value:"recommended",label:"Popular"},{value:"name",label:"A–Z"},{value:"price-low",label:"Price ↑"},{value:"price-high",label:"Price ↓"}] as const).map(option=><Pressable key={option.value} onPress={()=>setSortOrder(option.value)} style={[s.sortButton,sortOrder===option.value&&s.sortButtonActive]}><Text style={[s.sortText,sortOrder===option.value&&s.sortTextActive]}>{option.label}</Text></Pressable>)}</View>
    <Animated.ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categories}>{categories.map((value)=><Pressable key={value} onPress={()=>setCategory(value)} style={[s.category,category===value&&s.categoryActive]}><Text style={s.categoryEmoji}>{categoryEmoji(value)}</Text><Text style={[s.categoryText,category===value&&s.categoryTextActive]}>{value}</Text></Pressable>)}</Animated.ScrollView>
    {loading&&<View style={s.message}><ActivityIndicator color="#176b48"/><Text style={s.muted}>Loading fresh picks…</Text></View>}
    {!!error&&<Text style={s.error}>{error}<Text onPress={()=>{setLoading(true);setError("");loadCatalog().catch((e)=>setError(e instanceof Error?e.message:"Catalog unavailable.")).finally(()=>setLoading(false));}}>  Retry</Text></Text>}
    {!loading&&!error&&visibleItems.length===0&&<Text style={s.muted}>No products in this category yet.</Text>}
    <View style={s.productGrid}>{visibleItems.map((item)=>{
      const id=String(item.id), quantity=qty[id]||0;
      const imageState=failedImages[id]||0;
      const primaryImage=normalizedImageUrl(item.image_url)||fallbackProductImage(item.name);
      const imageUri=imageState===0?primaryImage:imageState===1?fallbackProductImage(item.name):"";
      const stock=Number(item.stock_qty??0), maxQuantity=Math.min(99,stock>0?stock:99);
      return <View key={id} style={s.productCard}>
        {imageUri?<Image source={{uri:imageUri}} style={s.image} onError={()=>setFailedImages((old)=>({...old,[id]:Math.min(2,(old[id]||0)+1)}))}/>:<View style={[s.image,s.imagePlaceholder]}><Text style={{fontSize:36}}>{productEmoji(item.name)}</Text></View>}
        <View style={s.productInfo}><Text style={s.categoryLabel}>{item.category||"Market fresh"}</Text><Text style={s.name}>{item.name}</Text><Text style={s.muted}>{item.shop_name||"Local Vegz market"}</Text>
          <View style={s.productBottom}><Text style={s.price}>₹{Number(item.price||0).toFixed(2)} <Text style={s.unit}>/ {item.unit||"item"}</Text></Text>
            {quantity===0?<Pressable style={s.add} onPress={()=>changeQty(item,1)}><Text style={s.addText}>+ Add</Text></Pressable>:<View style={s.controls}><Pressable style={s.qtyButton} onPress={()=>changeQty(item,quantity-1)}><Text style={s.qtyButtonText}>−</Text></Pressable><Text style={s.qtyText}>{quantity}</Text><Pressable style={s.qtyButton} disabled={quantity>=maxQuantity} onPress={()=>changeQty(item,quantity+1)}><Text style={s.qtyButtonText}>+</Text></Pressable></View>}
          </View>
        </View>
      </View>;
    })}</View>
    {basketOpen && <View style={s.basketPanel}>
      <View style={s.sectionHead}><Text style={s.sectionTitle}>Your basket</Text><Pressable onPress={() => setBasketOpen(false)}><Text style={s.link}>Close ×</Text></Pressable></View>
      {basket.map((item) => <View key={String(item.id)} style={s.basketItem}>
        <View style={s.basketItemInfo}><Text style={s.basketItemName}>{item.name}</Text><Text style={s.muted}>₹{Number(item.price||0).toFixed(2)} / {item.unit||"item"}</Text></View>
        <View style={s.controls}><Pressable style={s.qtyButton} onPress={() => changeQty(item,(qty[String(item.id)]||0)-1)}><Text style={s.qtyButtonText}>−</Text></Pressable><Text style={s.qtyText}>{qty[String(item.id)]||0}</Text><Pressable style={s.qtyButton} onPress={() => changeQty(item,(qty[String(item.id)]||0)+1)}><Text style={s.qtyButtonText}>+</Text></Pressable></View>
        <Text style={s.basketLineTotal}>₹{(Number(item.price||0)*(qty[String(item.id)]||0)).toFixed(2)}</Text>
      </View>)}
      <View style={s.basketTotals}><Text style={s.muted}>Subtotal</Text><Text style={s.basketItemName}>₹{subtotal.toFixed(2)}</Text></View>
      <View style={s.basketTotals}><Text style={s.muted}>Delivery</Text><Text style={s.basketItemName}>{fee===0?"FREE":"₹"+fee.toFixed(2)}</Text></View>
      <View style={s.basketTotals}><Text style={s.totalLabel}>Total</Text><Text style={s.totalPrice}>₹{total.toFixed(2)}</Text></View>
      <Action label="Proceed to checkout →" onPress={() => { setBasketOpen(false); setCheckoutError(""); setCheckoutOpen(true); }} disabled={!basket.length}/>
    </View>}
    <View style={s.total}><View><Text style={s.totalLabel}>Basket estimate</Text><Text style={s.muted}>{count} items · {fee===0?"Free delivery":`Delivery ₹${fee.toFixed(2)}`}</Text></View><View style={s.totalRight}><Text style={s.totalPrice}>₹{total.toFixed(2)}</Text><Pressable style={[s.action,count===0&&s.disabled]} disabled={count===0} onPress={()=>{setCheckoutError("");setCheckoutOpen(true);}}><Text style={s.actionText}>Checkout →</Text></Pressable></View></View>
    {checkoutOpen&&<View style={s.checkout}><View style={s.sectionHead}><Text style={s.sectionTitle}>Checkout</Text><Pressable onPress={()=>setCheckoutOpen(false)}><Text style={s.link}>Close ×</Text></Pressable></View>
      {!token?<View style={s.formCard}><Text style={s.cardTitle}>Verify your mobile number</Text><TextInput style={s.input} value={phone} onChangeText={setPhone} placeholder="+91 mobile number" keyboardType="phone-pad"/>
        {!otpSent?<Action label="Send verification code" onPress={requestOtp} disabled={busy||phone.trim().length<10}/>:<><TextInput style={s.input} value={otp} onChangeText={setOtp} placeholder="6-digit code" keyboardType="number-pad" maxLength={6}/>{!!demoOtp&&<Text style={s.demoCode}>Development OTP: {demoOtp}</Text>}<Action label="Verify and continue" onPress={verifyOtp} disabled={busy||otp.length!==6}/></>}
      </View>:<View style={s.formCard}>
        <Text style={s.cardTitle}>Delivery address</Text><Text style={s.muted}>Signed in as {customer?.phone||phone}. Delivery is available in Hubli and Dharwad.</Text>
        {addresses.length>0&&<><Text style={s.label}>Saved address</Text><View style={s.choiceRow}>{addresses.map(a=><Pressable key={a.id} onPress={()=>setSelectedAddressId(a.id)} style={[s.choice,selectedAddressId===a.id&&s.choiceActive]}><Text style={[s.choiceText,selectedAddressId===a.id&&s.choiceTextActive]}>{a.label}: {a.line1}, {a.city}</Text></Pressable>)}<Pressable onPress={()=>setSelectedAddressId(null)} style={[s.choice,selectedAddressId===null&&s.choiceActive]}><Text style={[s.choiceText,selectedAddressId===null&&s.choiceTextActive]}>+ New</Text></Pressable></View></>}
        {selectedAddressId===null&&<><Text style={s.label}>Recipient name</Text><TextInput style={s.input} value={address.recipient_name} onChangeText={v=>setAddress({...address,recipient_name:v})} placeholder="Full name"/>
          <Text style={s.label}>Contact phone</Text><TextInput style={s.input} value={address.phone} onChangeText={v=>setAddress({...address,phone:v})} placeholder="+91 mobile number" keyboardType="phone-pad"/>
          <Text style={s.label}>Address line</Text><TextInput style={s.input} value={address.line1} onChangeText={v=>setAddress({...address,line1:v})} placeholder="Flat, house, street"/>
          <Text style={s.label}>Landmark (optional)</Text><TextInput style={s.input} value={address.landmark} onChangeText={v=>setAddress({...address,landmark:v})} placeholder="Near…"/>
          <Text style={s.label}>City</Text><TextInput style={s.input} value={address.city} onChangeText={v=>setAddress({...address,city:v})} placeholder="Hubli or Dharwad"/>
          {!["hubli","dharwad"].includes(address.city.trim().toLowerCase())&&<Text style={s.citySoon}>Coming soon to {address.city||"your city"} — we currently serve Hubli and Dharwad.</Text>}
          <View style={s.choiceRow}><View style={s.fieldHalf}><Text style={s.label}>State</Text><TextInput style={s.input} value={address.state} onChangeText={v=>setAddress({...address,state:v})}/></View><View style={s.fieldHalf}><Text style={s.label}>PIN code</Text><TextInput style={s.input} value={address.postal_code} onChangeText={v=>setAddress({...address,postal_code:v})} keyboardType="number-pad"/></View></View>
        </>}
        <Text style={s.label}>Payment method</Text><View style={s.choiceRow}><Pressable style={[s.choice,paymentMethod==="cod"&&s.choiceActive]} onPress={()=>setPaymentMethod("cod")}><Text style={[s.choiceText,paymentMethod==="cod"&&s.choiceTextActive]}>Cash on delivery</Text></Pressable><Pressable style={[s.choice,paymentMethod==="online"&&s.choiceActive]} onPress={()=>setPaymentMethod("online")}><Text style={[s.choiceText,paymentMethod==="online"&&s.choiceTextActive]}>Online · pending</Text></Pressable></View>
        {paymentMethod==="online"&&<Text style={s.muted}>No online payment will be collected until a gateway is connected.</Text>}
        <Action label={busy?"Placing order…":`Place order · ₹${total.toFixed(2)}`} onPress={placeOrder} disabled={busy||!basket.length||(selectedAddressId===null&&(!address.recipient_name.trim()||!address.phone.trim()||address.line1.trim().length<4||address.postal_code.trim().length<4||!["hubli","dharwad"].includes(address.city.trim().toLowerCase())))}/>
      </View>}
      {!!checkoutError&&<Text style={s.error}>{checkoutError}</Text>}
      <View style={s.formCard}><Text style={s.cardTitle}>Order summary</Text>{basket.map(item=><View key={item.id} style={s.summaryRow}><Text style={s.summaryText}>{item.name} × {qty[String(item.id)]}</Text><Text style={s.summaryText}>₹{(Number(item.price)*qty[String(item.id)]).toFixed(2)}</Text></View>)}<View style={s.summaryRow}><Text style={s.summaryText}>Delivery fee</Text><Text style={s.summaryText}>{fee===0?"FREE":"₹"+fee.toFixed(2)}</Text></View><Text style={s.totalPrice}>₹{total.toFixed(2)}</Text></View>
    </View>}
    <View style={s.sectionHead}><Text style={s.sectionTitle}>Your orders</Text>{!!token&&<Pressable onPress={()=>loadAccount(token)}><Text style={s.link}>Refresh</Text></Pressable>}</View>
    {!!orderNotice&&<Text style={s.notice}>{orderNotice}</Text>}
    {!token?<Text style={s.muted}>Verify your phone at checkout to see order history.</Text>:orders.length===0?<Text style={s.muted}>No orders yet. Your order status will appear here after ordering.</Text>:orders.map(order=><View key={order.id} style={s.orderCard}><View style={s.orderRow}><Text style={s.orderCode}>{order.tracking_code}</Text><Text style={s.status}>{order.status.replace(/_/g," ")}</Text></View><Text style={s.price}>₹{Number(order.total_amount).toFixed(2)}</Text><Text style={s.muted}>Payment: {order.payment_status.replace(/_/g," ")} · {new Date(order.created_at).toLocaleString()}</Text></View>)}
    <Text style={s.note}>Vegz connects local vegetable and grocery shops with neighbourhood customers. Online payment and live GPS require production integrations.</Text>
  </Animated.ScrollView>
    {count > 0 && !checkoutOpen && !basketOpen && <View style={s.floatingBasket}>
      <View style={s.floatingBasketInfo}>
        <Text style={s.floatingBasketCount}>{count} {count === 1 ? "item" : "items"} in basket</Text>
        <Text style={s.floatingBasketTotal}>₹{total.toFixed(2)}</Text>
      </View>
      <Pressable style={s.floatingBasketButton} onPress={() => { setBasketOpen(true); requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true })); }}>
        <Text style={s.floatingBasketButtonText}>View basket →</Text>
      </Pressable>
    </View>}
    </SafeAreaView>;
}

function Action({label,onPress,disabled=false}:{label:string;onPress:()=>void;disabled?:boolean}){return <Pressable onPress={onPress} disabled={disabled} style={[s.action,disabled&&s.disabled]}><Text style={s.actionText}>{label}</Text></Pressable>}

const s=StyleSheet.create({
safe:{flex:1,backgroundColor:"#f6f8f1"},
pageWithBasket:{paddingBottom:115},
basketPanel:{backgroundColor:"#fff",borderRadius:17,padding:14,gap:12,borderWidth:1,borderColor:"#dbe5d8"},
basketItem:{flexDirection:"row",alignItems:"center",gap:8,paddingVertical:9,borderBottomWidth:1,borderBottomColor:"#edf0e8"},
basketItemInfo:{flex:1,gap:3,minWidth:0},
basketItemName:{fontSize:13,fontWeight:"900",color:"#1b3027"},
basketLineTotal:{fontSize:12,fontWeight:"900",color:"#176b48",minWidth:58,textAlign:"right"},
basketTotals:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10},
floatingBasket:{position:"absolute",left:14,right:14,bottom:12,backgroundColor:"#176b48",borderRadius:17,padding:13,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12,elevation:8,shadowColor:"#000",shadowOpacity:0.18,shadowRadius:10,shadowOffset:{width:0,height:4}},
floatingBasketInfo:{flex:1,gap:3},
floatingBasketCount:{fontSize:12,fontWeight:"700",color:"#e0f0e4"},
floatingBasketTotal:{fontSize:21,fontWeight:"900",color:"#fff"},
floatingBasketButton:{backgroundColor:"#fff",borderRadius:11,paddingHorizontal:15,paddingVertical:13},
floatingBasketButtonText:{fontSize:13,fontWeight:"900",color:"#176b48"},
page:{padding:16,paddingTop:22,paddingBottom:42,gap:13},
header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:18},
brand:{fontSize:29,fontWeight:"900",color:"#176b48",letterSpacing:-1},
period:{color:"#ef8a36"},
basketCount:{fontSize:12,fontWeight:"800",color:"#176b48",backgroundColor:"#e4f1e5",paddingHorizontal:12,paddingVertical:8,borderRadius:20},
eyebrow:{fontSize:10,fontWeight:"900",letterSpacing:2,color:"#176b48"},
title:{fontSize:35,lineHeight:40,fontWeight:"900",letterSpacing:-1,color:"#1b3027",marginTop:1},
sub:{fontSize:14,lineHeight:21,color:"#718077",marginTop:-6},
marketHero:{backgroundColor:"#e6efda",borderRadius:16,padding:16,flexDirection:"row",alignItems:"center",gap:12},
heroEmoji:{fontSize:22},
heroTitle:{fontSize:15,fontWeight:"900",color:"#1b3027"},
sectionHead:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:10},
sectionTitle:{fontSize:21,fontWeight:"900",color:"#1b3027"},
muted:{fontSize:12,lineHeight:18,color:"#718077",marginTop:4},
searchInput:{borderWidth:1,borderColor:"#dbe5d8",borderRadius:11,paddingHorizontal:13,paddingVertical:12,fontSize:14,color:"#1b3027",backgroundColor:"#fff"},
sortRow:{flexDirection:"row",alignItems:"center",gap:7,flexWrap:"wrap"},
sortButton:{borderWidth:1,borderColor:"#dbe5d8",borderRadius:9,backgroundColor:"#fff",paddingHorizontal:10,paddingVertical:7},
sortButtonActive:{backgroundColor:"#e6f1e3",borderColor:"#176b48"},
sortText:{fontSize:10,fontWeight:"700",color:"#53655a"},
sortTextActive:{color:"#176b48"},
categories:{gap:8,paddingVertical:6},
categoryEmoji:{fontSize:16},
category:{paddingHorizontal:14,paddingVertical:9,borderRadius:20,borderWidth:1,borderColor:"#dbe5d8",backgroundColor:"#fff"},
categoryActive:{backgroundColor:"#176b48",borderColor:"#176b48"},
categoryText:{fontSize:12,fontWeight:"700",color:"#53655a"},
categoryTextActive:{color:"#fff"},
message:{flexDirection:"row",alignItems:"center",gap:10,padding:20},
error:{color:"#a33525",backgroundColor:"#fff0ed",padding:12,borderRadius:10,fontSize:12,lineHeight:18},
productGrid:{flexDirection:"row",flexWrap:"wrap",justifyContent:"space-between",gap:10},
productCard:{flexDirection:"column",gap:9,backgroundColor:"#fff",borderRadius:15,borderWidth:1,borderColor:"#e2e9df",padding:10,width:"48%"},
image:{width:"100%",height:128,borderRadius:11,resizeMode:"cover",backgroundColor:"#eef2e8"},
imagePlaceholder:{alignItems:"center",justifyContent:"center"},
productInfo:{flex:1,justifyContent:"center",gap:4,minWidth:0},
categoryLabel:{fontSize:9,fontWeight:"900",letterSpacing:1,color:"#176b48",textTransform:"uppercase"},
name:{fontSize:16,fontWeight:"900",color:"#1b3027"},
productBottom:{flexDirection:"column",alignItems:"stretch",justifyContent:"flex-start",gap:9,marginTop:9},
price:{fontSize:15,fontWeight:"900",color:"#176b48"},
unit:{fontSize:10,fontWeight:"400",color:"#718077"},
add:{alignSelf:"flex-start",minWidth:76,alignItems:"center",backgroundColor:"#edf5e9",borderRadius:9,borderWidth:1,borderColor:"#d4e7d1",paddingHorizontal:13,paddingVertical:8},
addText:{fontSize:12,fontWeight:"900",color:"#176b48"},
controls:{alignSelf:"flex-start",flexDirection:"row",alignItems:"center",gap:10,borderRadius:9,borderWidth:1,borderColor:"#d4e7d1",padding:3,backgroundColor:"#fff"},
qtyButton:{width:27,height:27,backgroundColor:"#edf5e9",borderRadius:7,alignItems:"center",justifyContent:"center"},
qtyButtonText:{fontSize:17,fontWeight:"900",color:"#176b48"},
qtyText:{fontSize:13,fontWeight:"900",color:"#176b48"},
soon:{fontSize:10,fontWeight:"900",color:"#96531c",backgroundColor:"#fff4e7",padding:7,borderRadius:7,overflow:"hidden"},
total:{backgroundColor:"#e6efdf",borderRadius:17,padding:16,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10,marginTop:5,borderWidth:1,borderColor:"#d8e6d2"},
totalLabel:{fontSize:15,fontWeight:"900",color:"#1b3027"},
totalRight:{alignItems:"flex-end",gap:4},
totalPrice:{fontSize:23,fontWeight:"900",color:"#176b48"},
action:{backgroundColor:"#176b48",paddingVertical:13,paddingHorizontal:15,borderRadius:11,alignItems:"center",justifyContent:"center",marginTop:6},
actionText:{fontSize:13,fontWeight:"900",color:"#fff"},
disabled:{opacity:.45},
checkout:{gap:12,backgroundColor:"#edf4e7",padding:12,borderRadius:18,marginTop:4},
formCard:{backgroundColor:"#fff",padding:14,borderRadius:14,borderWidth:1,borderColor:"#e2e9df",gap:8},
cardTitle:{fontSize:16,fontWeight:"900",color:"#1b3027",marginBottom:2},
input:{borderWidth:1,borderColor:"#dbe5d8",borderRadius:10,paddingHorizontal:12,paddingVertical:11,fontSize:14,color:"#1b3027",backgroundColor:"#fbfcfa"},
label:{fontSize:12,fontWeight:"800",color:"#445548",marginTop:3},
demoCode:{fontSize:12,color:"#8b4e1c",backgroundColor:"#fff4e7",padding:10,borderRadius:8},
choiceRow:{flexDirection:"row",alignItems:"stretch",gap:7,flexWrap:"wrap"},
choice:{borderWidth:1,borderColor:"#dbe5d8",backgroundColor:"#fff",borderRadius:9,padding:10},
choiceActive:{backgroundColor:"#e6f1e3",borderColor:"#176b48"},
choiceText:{fontSize:11,fontWeight:"700",color:"#53655a"},
choiceTextActive:{color:"#176b48"},
fieldHalf:{flex:1,minWidth:120},
citySoon:{color:"#8a4e1c",backgroundColor:"#fff4e6",padding:10,borderRadius:8,fontSize:12,lineHeight:17},
link:{color:"#176b48",fontSize:12,fontWeight:"900"},
summaryRow:{flexDirection:"row",justifyContent:"space-between",gap:12,paddingVertical:8,borderBottomWidth:1,borderBottomColor:"#edf0e8"},
summaryText:{fontSize:12,color:"#53655a",flexShrink:1},
notice:{fontSize:12,lineHeight:18,color:"#176b48",backgroundColor:"#e6f1e3",padding:12,borderRadius:10},
orderCard:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e2e9df",borderRadius:14,padding:14,gap:6},
orderRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:8},
orderCode:{fontWeight:"900",color:"#1b3027"},
status:{fontSize:10,fontWeight:"900",textTransform:"capitalize",color:"#176b48",backgroundColor:"#edf5e9",paddingHorizontal:8,paddingVertical:5,borderRadius:8,overflow:"hidden"},
note:{fontSize:11,lineHeight:17,color:"#718077",marginTop:15}
});
