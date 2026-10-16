import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, SafeAreaView, ScrollView, Text, View, Pressable, StyleSheet } from "react-native";

type Product = {
  id: number | string;
  name: string;
  category?: string;
  image_url?: string;
  price: number | string;
  unit?: string;
  is_available?: boolean;
  coming_soon?: boolean;
  shop_name?: string;
};

const API_BASE = (process.env.EXPO_PUBLIC_VEGZ_API_URL || "http://10.0.2.2:8003").replace(/\/$/, "");

export default function Home() {
  const [items, setItems] = useState<Product[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/api/products`)
      .then((response) => {
        if (!response.ok) throw new Error("Catalog request failed");
        return response.json() as Promise<Product[]>;
      })
      .then((data) => { if (active) setItems(Array.isArray(data) ? data : []); })
      .catch(() => { if (active) setError("Cannot connect to Vegz API. Set EXPO_PUBLIC_VEGZ_API_URL to your computer's LAN IP for a physical phone."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const total = useMemo(() => items.reduce((sum, item) => sum + Number(item.price || 0) * (qty[String(item.id)] || 0), 0), [items, qty]);
  const count = Object.values(qty).reduce((sum, value) => sum + value, 0);

  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}>
    <View style={s.header}><Text style={s.brand}>vegz<Text style={s.period}>.</Text></Text><Text style={s.basket}>{count} in basket</Text></View>
    <Text style={s.eyebrow}>YOUR NEIGHBOURHOOD MARKET</Text>
    <Text style={s.title}>Fresh market finds, delivered.</Text>
    <Text style={s.sub}>Vegetables and everyday groceries from local stores in your city.</Text>
    <View style={s.service}><Text style={s.serviceIcon}>🛵</Text><View><Text style={s.serviceTitle}>Local stores. One basket.</Text><Text style={s.muted}>Starting with Hubli and Dharwad</Text></View></View>
    <View style={s.sectionHead}><Text style={s.sectionTitle}>Today's market</Text><Text style={s.muted}>{items.length} products</Text></View>
    {loading && <View style={s.message}><ActivityIndicator color="#176b48" /><Text style={s.muted}>Loading fresh picks…</Text></View>}
    {!!error && <View style={s.error}><Text style={s.errorText}>{error}</Text><Pressable style={s.retry} onPress={() => { setLoading(true); setError(""); fetch(`${API_BASE}/api/products`).then(r=>{if(!r.ok) throw new Error();return r.json() as Promise<Product[]>}).then(data=>setItems(Array.isArray(data)?data:[])).catch(()=>setError("Still unable to reach the API. Check your URL and network.")).finally(()=>setLoading(false)); }}><Text style={s.retryText}>Retry</Text></Pressable></View>}
    {!loading && !error && items.length === 0 && <Text style={s.muted}>No products available yet.</Text>}
    {items.map((item) => {
      const id = String(item.id);
      const quantity = qty[id] || 0;
      const unavailable = item.is_available === false || item.coming_soon === true;
      return <View key={id} style={s.card}>
        {item.image_url ? <Image source={{ uri: item.image_url }} style={s.image} /> : <View style={[s.image, s.imagePlaceholder]}><Text style={{fontSize:28}}>🥬</Text></View>}
        <View style={s.productInfo}><Text style={s.category}>{item.category || "Market fresh"}</Text><Text style={s.name}>{item.name}</Text><Text style={s.muted}>{item.shop_name || "Local Vegz market"}</Text><View style={s.productBottom}><Text style={s.price}>₹{Number(item.price || 0).toFixed(2)} <Text style={s.unit}>/ {item.unit || "item"}</Text></Text>
          {unavailable ? <Text style={s.soon}>Coming soon</Text> : <View style={s.controls}><Pressable accessibilityLabel={"Remove "+item.name} style={s.button} onPress={()=>setQty(old=>({...old,[id]:Math.max(0,quantity-1)}))}><Text style={s.buttonText}>−</Text></Pressable><Text style={s.qty}>{quantity}</Text><Pressable accessibilityLabel={"Add "+item.name} style={[s.button,s.plus]} onPress={()=>setQty(old=>({...old,[id]:quantity+1}))}><Text style={[s.buttonText,s.plusText]}>+</Text></Pressable></View>}
        </View></View>
      );
    })}
    <View style={s.total}><View><Text style={s.totalLabel}>Basket estimate</Text><Text style={s.muted}>{count} items selected</Text></View><Text style={s.totalPrice}>₹{total.toFixed(2)}</Text></View>
    <Text style={s.note}>Catalog is connected to the API. Checkout, OTP and payments will be enabled after end-to-end testing.</Text>
  </ScrollView></SafeAreaView>;
}

const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:"#f6f8f1"},page:{padding:18,paddingTop:24,paddingBottom:38},header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:32},brand:{fontSize:29,fontWeight:"900",color:"#176b48"},period:{color:"#ef8a36"},basket:{fontSize:12,fontWeight:"700",color:"#176b48",backgroundColor:"#e4f1e5",paddingVertical:8,paddingHorizontal:12,borderRadius:20},eyebrow:{fontSize:10,fontWeight:"800",letterSpacing:2,color:"#176b48"},title:{fontSize:34,lineHeight:39,fontWeight:"900",color:"#1b3027",marginTop:10},sub:{fontSize:14,lineHeight:21,color:"#718077",marginTop:10,marginBottom:20},service:{flexDirection:"row",alignItems:"center",gap:13,padding:15,borderRadius:16,backgroundColor:"#e6efdf",marginBottom:28},serviceIcon:{fontSize:28},serviceTitle:{fontSize:14,fontWeight:"800",color:"#1b3027"},muted:{fontSize:11,color:"#718077",marginTop:4},sectionHead:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:14},sectionTitle:{fontSize:22,fontWeight:"800",color:"#1b3027"},card:{flexDirection:"row",gap:12,padding:11,backgroundColor:"#fff",borderRadius:15,borderWidth:1,borderColor:"#e2e9df",marginBottom:11},image:{width:84,height:92,borderRadius:11,backgroundColor:"#eef2e8"},imagePlaceholder:{alignItems:"center",justifyContent:"center"},productInfo:{flex:1,justifyContent:"center"},category:{fontSize:9,fontWeight:"800",color:"#176b48",textTransform:"uppercase",letterSpacing:1},name:{fontSize:15,fontWeight:"800",color:"#1b3027",marginTop:4},productBottom:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:4,marginTop:10},price:{fontSize:14,fontWeight:"800",color:"#1b3027"},unit:{fontSize:10,fontWeight:"400",color:"#718077"},controls:{flexDirection:"row",alignItems:"center",gap:8},button:{width:27,height:27,alignItems:"center",justifyContent:"center",borderRadius:8,borderWidth:1,borderColor:"#d4e7d1",backgroundColor:"#eff6ed"},plus:{backgroundColor:"#176b48",borderColor:"#176b48"},buttonText:{fontSize:18,color:"#176b48",fontWeight:"700"},plusText:{color:"#fff"},qty:{minWidth:12,textAlign:"center",fontSize:12,fontWeight:"700",color:"#1b3027"},soon:{fontSize:10,color:"#9b5118"},total:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",padding:17,backgroundColor:"#e6efdf",borderRadius:16,marginTop:12},totalLabel:{fontSize:14,fontWeight:"800",color:"#1b3027"},totalPrice:{fontSize:22,fontWeight:"900",color:"#176b48"},note:{fontSize:11,lineHeight:17,color:"#718077",marginTop:18},message:{padding:24,alignItems:"center",gap:10},error:{padding:15,backgroundColor:"#fff0ed",borderRadius:12,marginBottom:15},errorText:{color:"#9b2c2c",fontSize:12,lineHeight:18},retry:{alignSelf:"flex-start",marginTop:10,backgroundColor:"#176b48",paddingVertical:8,paddingHorizontal:12,borderRadius:8},retryText:{color:"#fff",fontWeight:"700",fontSize:12}
});
