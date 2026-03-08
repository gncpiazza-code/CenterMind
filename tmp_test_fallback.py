import os
import asyncio
from dotenv import load_dotenv
from CenterMind.bot_worker import Database

load_dotenv(r'c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env')

async def test_fallback():
    db = Database()
    
    # Test with a vendor that might trigger PENDIENTE_MAPEO (e.g. 1111111)
    # I fixed 1111111 with dummy, let's use a brand new one or set one back to null
    print("Testing Fallback for vendor 999999 (should have no mapping)...")
    
    params = {
        "distribuidor_id": 1,
        "chat_id": -5125535838,
        "vendedor_id": 999999,
        "nro_cliente": "999_FALLBACK_TEST",
        "tipo_pdv": "TEST_FALLBACK",
        "drive_link": "http://fallback.test",
        "telegram_msg_id": 1234,
        "telegram_chat_id": -5125535838
    }
    
    # The RPC should return error 'PENDIENTE_MAPEO' and our Python code should intercept and do the manual insert
    res = await asyncio.to_thread(db.registrar_exhibicion, **params)
    print("Result after fallback handle:", res)

if __name__ == "__main__":
    asyncio.run(test_fallback())
