import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { getProducts } from "../services/api";
import { Product } from "../types/models";
import { useStore } from "../store";

const cats = ["All", "Leafy", "Root", "Vegetables"];

export default function HomeScreen({ navigation }: any) {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const { cart, add, remove } = useStore();

  const load = async () => {
    setRefreshing(true);
    try {
      setError(false);
      setProducts(await getProducts());
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const data = useMemo(
    () =>
      products.filter(
        (product) =>
          (category === "All" ||
            product.category === category ||
            product.category === "Vegetables") &&
          (product.name.toLowerCase().includes(query.toLowerCase()) ||
            product.category.toLowerCase().includes(query.toLowerCase()))
      ),
    [products, query, category]
  );

  const quantity = (id: string) =>
    cart.find((item) => String(item.id) === String(id))?.quantity || 0;

  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce(
    (sum, item) => sum + Number(item.price) * item.quantity,
    0
  );

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <View>
          <Text style={styles.greeting}>Fresh & local</Text>
          <Text style={styles.title}>Shop fresh vegetables</Text>
        </View>
        <Pressable
          style={styles.profileButton}
          onPress={() => navigation.navigate("Profile")}
        >
          <Text>👤</Text>
        </Pressable>
      </View>

      <View style={styles.search}>
        <Text>⌕</Text>
        <TextInput
          placeholder="Search vegetables"
          placeholderTextColor="#7B827A"
          value={query}
          onChangeText={setQuery}
          style={styles.input}
        />
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={cats}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.categories}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setCategory(item)}
            style={[styles.category, category === item && styles.categoryActive]}
          >
            <Text
              style={
                category === item
                  ? styles.categoryTextActive
                  : styles.categoryText
              }
            >
              {item}
            </Text>
          </Pressable>
        )}
      />

      {error && (
        <Pressable onPress={load} style={styles.error}>
          <Text>Couldn't load products. Tap to retry.</Text>
        </Pressable>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Fresh vegetables</Text>
        <Pressable onPress={() => navigation.navigate("Cart")}>
          <Text style={styles.cart}>🛒 {itemCount}</Text>
        </Pressable>
      </View>

      <FlatList
        data={data}
        numColumns={2}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={load} />
        }
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No vegetables found.</Text>
        }
        renderItem={({ item }) => {
          const itemQuantity = quantity(String(item.id));

          return (
            <View style={styles.card}>
              <Pressable
                onPress={() =>
                  navigation.navigate("ProductDetails", { product: item })
                }
              >
                <View style={styles.picture}>
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.image} />
                  ) : (
                    <Text style={styles.emoji}>🥕</Text>
                  )}
                </View>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.unit}>
                  ₹{item.price}/{item.unit}
                </Text>
              </Pressable>

              <View style={styles.priceRow}>
                <Text style={styles.price}>₹{item.price}</Text>

                {itemQuantity === 0 ? (
                  <Pressable
                    style={styles.add}
                    onPress={() => add(item)}
                  >
                    <Text style={styles.addText}>Add</Text>
                  </Pressable>
                ) : (
                  <View style={styles.controls}>
                    <Pressable
                      onPress={() => remove(String(item.id))}
                      style={styles.small}
                    >
                      <Text>−</Text>
                    </Pressable>
                    <Text style={styles.quantity}>{itemQuantity}</Text>
                    <Pressable
                      onPress={() => add(item)}
                      style={styles.small}
                    >
                      <Text>+</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />

      {cart.length > 0 && (
        <Pressable
          style={styles.cartBar}
          onPress={() => navigation.navigate("Cart")}
        >
          <Text style={styles.cartBarText}>
            {itemCount} items · ₹{cartTotal.toFixed(0)}
          </Text>
          <Text style={styles.cartGo}>View cart →</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 52,
    paddingHorizontal: 18,
  },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greeting: {
    fontSize: 14,
    color: "#687168",
  },
  title: {
    fontSize: 25,
    fontWeight: "900",
    marginTop: 3,
    color: "#172018",
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#E7F1E6",
    alignItems: "center",
    justifyContent: "center",
  },
  search: {
    height: 50,
    borderRadius: 14,
    backgroundColor: "#FFF",
    marginTop: 18,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
  },
  categories: {
    gap: 8,
    paddingVertical: 15,
  },
  category: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: "#FFF",
  },
  categoryActive: {
    backgroundColor: "#2E7D32",
  },
  categoryText: {
    color: "#4E574E",
  },
  categoryTextActive: {
    color: "#FFF",
    fontWeight: "700",
  },
  section: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "800",
  },
  cart: {
    fontWeight: "700",
    color: "#2E7D32",
  },
  list: {
    paddingBottom: 120,
  },
  card: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 10,
    margin: 5,
  },
  picture: {
    height: 120,
    borderRadius: 13,
    backgroundColor: "#F0F4EA",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  emoji: {
    fontSize: 55,
  },
  image: {
    width: "100%",
    height: "100%",
    borderRadius: 13,
  },
  name: {
    fontSize: 16,
    fontWeight: "800",
    marginTop: 9,
  },
  unit: {
    fontSize: 12,
    color: "#788078",
    marginTop: 2,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  price: {
    fontSize: 17,
    fontWeight: "900",
  },
  add: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#2E7D32",
  },
  addText: {
    color: "#FFF",
    fontWeight: "800",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  small: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "#E7F1E6",
    alignItems: "center",
    justifyContent: "center",
  },
  quantity: {
    fontWeight: "800",
  },
  error: {
    padding: 12,
    backgroundColor: "#FDECEC",
    borderRadius: 10,
  },
  empty: {
    textAlign: "center",
    padding: 30,
    color: "#697069",
  },
  cartBar: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 12,
    backgroundColor: "#205B27",
    borderRadius: 16,
    padding: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cartBarText: {
    color: "#FFF",
    fontWeight: "900",
  },
  cartGo: {
    color: "#FFF",
    fontWeight: "800",
  },
});
