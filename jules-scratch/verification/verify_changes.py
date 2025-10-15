import asyncio
from playwright.async_api import async_playwright, expect
import os

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        # Get the absolute path to the HTML file
        file_path = os.path.abspath("index.html")

        # Mobile view tests
        await page.set_viewport_size({"width": 375, "height": 812})
        await page.goto(f"file://{file_path}")

        # Test burger menu
        await page.locator("#burger-btn").click()
        await expect(page.locator("#burger-menu-panel")).to_be_visible()
        await page.screenshot(path="jules-scratch/verification/mobile_burger_menu_final.png")
        await page.locator("#burger-close-btn").click() # Close the menu

        # Test scroll to top button
        await page.evaluate("window.scrollTo(0, 500)")
        await expect(page.locator("#scrollTopBtn")).to_be_visible()
        # Use force=True because the liquid ether canvas might intercept the click
        await page.locator("#scrollTopBtn").click(force=True)
        await page.wait_for_function("window.scrollY === 0")

        # Test mobile modal layout
        await page.locator(".card[data-project='tri']").click()
        await expect(page.locator(".modal")).to_be_visible()
        await page.screenshot(path="jules-scratch/verification/mobile_modal_layout_final.png")
        await page.locator(".m-close").click()


        # Desktop view tests
        await page.set_viewport_size({"width": 1920, "height": 1080})
        await page.goto(f"file://{file_path}")

        # Test desktop modal layout
        await page.locator(".card[data-project='tri']").click()
        await expect(page.locator(".modal")).to_be_visible()
        await page.screenshot(path="jules-scratch/verification/desktop_modal_layout_final.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
