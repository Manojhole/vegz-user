import os
import tempfile
import unittest
from unittest.mock import Mock, patch

db_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
db_file.close()
os.environ["DATABASE_URL"] = "sqlite:///" + db_file.name
os.environ["APP_ENV"] = "development"
os.environ["JWT_SECRET"] = "test-user-secret-that-is-long-enough-for-tests"
os.environ["OTP_SECRET"] = "test-user-otp-secret-that-is-long-enough"
os.environ["SHOP_SERVICE_URL"] = ""
os.environ["SHOP_PUBLIC_URL"] = "http://localhost:8002"

from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


class CustomerMarketplaceIntegrationTests(unittest.TestCase):
    def test_catalog_uses_shop_marketplace_city_and_preserves_shop_images(self):
        remote = [{
            "shop_id": 44,
            "shop_name": "Hubli Fresh Vegetables",
            "shop_type": "vegetable",
            "shop_address": "Market Road, Hubli",
            "products": [{
                "id": 7, "name": "Tomato", "category": "Vegetables",
                "description": "Fresh tomatoes", "image_url": "/uploads/tomato.jpg",
                "image_urls": ["/uploads/tomato.jpg", "https://cdn.example.test/tomato-2.jpg"],
                "unit": "kg", "price": 35, "stock_qty": 8, "customer_can_order": True,
            }],
        }]
        response = Mock()
        response.raise_for_status = Mock()
        response.json = Mock(return_value=remote)
        with patch("backend.app.main.SHOP_SERVICE_URL", "http://shop.test"), \
             patch("backend.app.main.SHOP_PUBLIC_URL", "http://localhost:8002"), \
             patch("backend.app.main.httpx.get", return_value=response) as marketplace_get:
            result = client.get("/api/products?city=Hubli")
        self.assertEqual(result.status_code, 200, result.text)
        products = result.json()
        self.assertEqual(len(products), 1)
        self.assertEqual(products[0]["shop_id"], 44)
        self.assertEqual(products[0]["shop_name"], "Hubli Fresh Vegetables")
        self.assertEqual(products[0]["image_url"], "http://localhost:8002/uploads/tomato.jpg")
        self.assertEqual(products[0]["image_urls"][1], "https://cdn.example.test/tomato-2.jpg")
        self.assertEqual(marketplace_get.call_args.kwargs["params"], {"city": "Hubli"})

    def test_shop_service_failure_is_not_silently_replaced_by_stale_catalog(self):
        with patch("backend.app.main.SHOP_SERVICE_URL", "http://shop.test"), \
             patch("backend.app.main.httpx.get", side_effect=__import__("httpx").ConnectError("offline")):
            response = client.get("/api/products?city=Dharwad")
        self.assertEqual(response.status_code, 502)
        self.assertIn("live shop catalog", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
