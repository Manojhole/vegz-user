import React from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import type { Product } from "../types/product";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

const products: Product[] = [
  { id: "1", name: "Tomato", category: "Vegetables", price: 40, unit: "kg" },
  { id: "2", name: "Potato", category: "Vegetables", price: 35, unit: "kg" },
  { id: "3", name: "Onion", category: "Vegetables", price: 45, unit: "kg" }
];

export default function HomeScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fresh vegetables, delivered.</Text>
      <Text style={styles.subtitle}>Browse vegetables and start your cart.</Text>

      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => navigation.navigate("ProductDetails", { product: item })}
          >
            <View>
              <Text style={styles.name}>{item.name}</Text>
              <Text>{item.category}</Text>
            </View>
            <Text style={styles.price}>₹{item.price}/{item.unit}</Text>
          </Pressable>
        )}
      />

      <View style={styles.actions}>
        <Pressable onPress={() => navigation.navigate("Cart")}><Text style={styles.link}>Cart</Text></Pressable>
        <Pressable onPress={() => navigation.navigate("Profile")}><Text style={styles.link}>Profile</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 8 },
  subtitle: { fontSize: 16, marginBottom: 20 },
  card: { padding: 16, borderWidth: 1, borderRadius: 12, marginBottom: 12, flexDirection: "row", justifyContent: "space-between" },
  name: { fontSize: 18, fontWeight: "600" },
  price: { fontWeight: "700" },
  actions: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 16 },
  link: { fontSize: 16, fontWeight: "600" }
});