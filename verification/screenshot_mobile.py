import asyncio
from playwright.async_api import async_playwright
import os

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={'width': 390, 'height': 844}, user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1')
        page = await context.new_page()

        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"PAGE ERROR: {exc}"))

        url = "file://" + os.path.abspath("index.html")
        await page.goto(url)

        try:
            await page.wait_for_selector('.project-item', timeout=5000)
            await page.click('[data-project="thin-layer"]')
            await page.wait_for_selector('#overlay.show', timeout=5000)
            await page.wait_for_timeout(3000)
            await page.screenshot(path="verification/modal_mobile.png")
        except Exception as e:
            print(f"Error during execution: {e}")
            await page.screenshot(path="verification/error_mobile.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
