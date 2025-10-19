import asyncio
from playwright.async_api import async_playwright
import os

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Get the absolute path to the HTML file
        html_file_path = os.path.abspath('index.html')

        # Navigate to the local HTML file
        await page.goto(f'file://{html_file_path}')

        # Click on the first project card to open the modal
        await page.click('#grid-projects .card')

        # Wait for the modal to be visible
        await page.wait_for_selector('#overlay.show')

        # Desktop screenshot
        await page.set_viewport_size({"width": 1280, "height": 800})
        await page.screenshot(path='jules-scratch/verification/desktop_modal.png')

        # Mobile screenshot
        await page.set_viewport_size({"width": 375, "height": 812})
        await page.screenshot(path='jules-scratch/verification/mobile_modal.png')

        await browser.close()

if __name__ == '__main__':
    asyncio.run(main())
