from sp_api.api import Orders
from sp_api.base import Marketplaces

try:
    orders_api = Orders(marketplace=Marketplaces.US)
    result = orders_api.get_orders(CreatedAfter='2024-04-01T00:00:00Z')
    print(result.payload.get('Orders', []))
except Exception as e:
    print("❌ Error connecting to Amazon:", e)
