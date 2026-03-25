
from api import get_unified_dashboard
from types import SimpleNamespace
import traceback

class MockUser:
    def get(self, key, default=None):
        if key == "is_superadmin": return True
        return default

try:
    print("Testing get_unified_dashboard...")
    res = get_unified_dashboard(MockUser())
    print("✅ Success!")
    print(f"Data count: {len(res)}")
except Exception as e:
    print("❌ Failed!")
    traceback.print_exc()
