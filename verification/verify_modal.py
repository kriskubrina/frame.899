import asyncio
from playwright.async_api import async_playwright
import os

async def verify_modal_layout():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        # Set viewport size to desktop
        page = await browser.new_page(viewport={'width': 1280, 'height': 800})

        # Open the local file
        file_path = "file://" + os.path.abspath("index.html")
        await page.goto(file_path)

        # Wait for preloading
        await page.wait_for_timeout(2000)

        # Open a project modal
        await page.click('#grid-projects [data-project="water"]')
        await page.wait_for_selector('#overlay.show')

        # Wait a bit for layout to settle
        await page.wait_for_timeout(1000)

        # Capture screenshot of the modal area
        await page.screenshot(path="verification/modal_desktop.png")

        print("Screenshot saved to verification/modal_desktop.png")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(verify_modal_layout())
