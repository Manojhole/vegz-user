from pydantic import BaseModel, ConfigDict, Field, field_validator


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    category: str
    description: str
    image_url: str
    unit: str
    price: float
    stock_qty: int


class OtpRequest(BaseModel):
    phone: str = Field(min_length=10, max_length=16)

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, value: str) -> str:
        cleaned = "".join(ch for ch in value if ch.isdigit() or ch == "+")
        digits = "".join(ch for ch in cleaned if ch.isdigit())
        if len(digits) < 10 or len(digits) > 15:
            raise ValueError("Enter a valid phone number including country code if needed.")
        return "+" + digits if cleaned.startswith("+") else digits


class OtpVerify(BaseModel):
    phone: str = Field(min_length=10, max_length=16)
    otp: str = Field(pattern=r"^\\d{6}$")


class UserOut(BaseModel):
    id: int
    phone: str
    full_name: str | None = None


class AuthOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class AddressIn(BaseModel):
    label: str = Field(default="Home", max_length=30)
    recipient_name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=10, max_length=16)
    line1: str = Field(min_length=4, max_length=220)
    line2: str = Field(default="", max_length=220)
    landmark: str = Field(default="", max_length=160)
    city: str = Field(min_length=2, max_length=100)
    state: str = Field(min_length=2, max_length=100)
    postal_code: str = Field(min_length=4, max_length=12)
    is_default: bool = False


class AddressOut(AddressIn):
    model_config = ConfigDict(from_attributes=True)

    id: int


class CartItemIn(BaseModel):
    product_id: int
    quantity: int = Field(ge=1, le=99)


class OrderIn(BaseModel):
    address_id: int
    payment_method: str = Field(pattern=r"^(cod|online)$")
    items: list[CartItemIn] = Field(min_length=1, max_length=60)


class OrderItemOut(BaseModel):
    product_id: int
    product_name: str
    unit: str
    unit_price: float
    quantity: int
    line_total: float


class OrderOut(BaseModel):
    id: int
    tracking_code: str
    subtotal: float
    delivery_fee: float
    total_amount: float
    payment_method: str
    payment_status: str
    status: str
    created_at: str
    items: list[OrderItemOut]
