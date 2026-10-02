import AsyncStorage from"@react-native-async-storage/async-storage";import{API_BASE_URL}from"../config/api";import{Order,Product}from"../types/models";
async function req<T>(path:string,options:RequestInit={}){const token=await AsyncStorage.getItem("vegz-token");const r=await fetch(API_BASE_URL+path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{}),...(options.headers||{})}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.message||"API request failed");return data as T}
export function getProducts(){return req<Product[]>("/api/products")}
export function requestOtp(phone:string){return req<{success:boolean;message:string;devOtp?:string}>("/api/auth/request-otp",{method:"POST",body:JSON.stringify({phone})})}
export function verifyOtp(phone:string,otp:string){return req<{token:string;user:{id:number;name:string;phone:string;role:string}}>("/api/auth/verify-otp",{method:"POST",body:JSON.stringify({phone,otp})})}
export function createOrder(order:{items:{productId:string;quantity:number}[];address:Order["address"]}){return req<{id:number;status:string;total:number}>("/api/orders",{method:"POST",headers:{"Idempotency-Key":crypto.randomUUID()},body:JSON.stringify(order)})}
export function getOrders(){return req<Order[]>("/api/orders")}
export async function saveToken(token:string){await AsyncStorage.setItem("vegz-token",token)}
