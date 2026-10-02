import React from "react";
import { Button, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";

type Props = NativeStackScreenProps<RootStackParamList, "ProductDetails">;

export default function ProductDetailsScreen({ route, navigation }: Props) {
  const { product } = route.params;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{product.name}</Text>
      <Text>{product.category}</Text>
      <Text style={styles.price}>₹{product.price}/{product.unit}</Text>
      <Button title="Add to Cart" onPress={() => navigation.navigate("Cart")} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12 },
  title: { fontSize: 30, fontWeight: "700" },
  price: { fontSize: 22, fontWeight: "700", marginVertical: 12 }
});