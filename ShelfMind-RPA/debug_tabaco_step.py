import asyncio
import os
from playwright.async_api import async_playwright
from lib.vault_client import get_secret

async def run():
    tenant = {
        "id":         "tabaco",
        "nombre":     "Tabaco & Hnos",
        "url_base":   "https://tabacohermanos.chesserp.com/AR1149",
        "vault_user": "chess_tabaco_usuario",
        "vault_pass": "chess_tabaco_password",
    }
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        
        print(f"Navigating to {tenant['url_base']}...")
        await page.goto(f"{tenant['url_base']}/#/login", wait_until="networkidle")
        await page.screenshot(path="debug_1_landed.png")
        
        # Check for update popup
        try:
            btn = page.locator('button:has-text("Actualizar")')
            if await btn.is_visible():
                print("Closing update popup...")
                await btn.click()
                await page.wait_for_timeout(2000)
                await page.screenshot(path="debug_2_after_popup.png")
        except:
            pass
            
        print("Finding inputs...")
        user_field = page.locator('#username1')
        pass_field = page.locator('#pass')
        
        await user_field.wait_for(state="visible", timeout=10000)
        print("Inputs are visible.")
        
        usuario = get_secret(tenant["vault_user"])
        password = get_secret(tenant["vault_pass"])
        print(f"Credentials fetched: user length={len(usuario)}")
        
        print("Filling inputs...")
        await user_field.fill(usuario)
        await user_field.dispatch_event("input")
        await pass_field.fill(password)
        await pass_field.dispatch_event("input")
        
        await page.screenshot(path="debug_3_after_fill.png")
        
        btn_login = page.locator('button:has-text("INICIAR SESIÓN")')
        is_enabled = await btn_login.is_enabled()
        print(f"Login button enabled: {is_enabled}")
        
        if is_enabled:
            print("Clicking login...")
            await btn_login.click()
            await page.wait_for_timeout(5000)
            await page.screenshot(path="debug_4_after_click.png")
            print(f"Final URL: {page.url}")
        else:
            print("Login button NOT enabled. Checking values...")
            user_val = await user_field.input_value()
            pass_val = await pass_field.input_value()
            print(f"User field value: '{user_val}'")
            print(f"Pass field value length: {len(pass_val)}")
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
