export type Product={id:string;name:string;category:string;price:number;unit:string;imageUrl?:string;description?:string;stock?:number};
export type CartItem=Product & {quantity:number};
export type Address={id:string;name:string;phone:string;line1:string;city:string;state:string;pincode:string};
export type Order={id:string;items:CartItem[];total:number;address:Address;status:string;createdAt:string};