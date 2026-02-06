import asyncio
from playwright.async_api import async_playwright
import os

async def run():
    async_playwright_ctx = await async_playwright().start()
    # Try with GPU disabled to avoid WebGL stalls
    browser = await async_playwright_ctx.chromium.launch(args=["--disable-gpu", "--disable-software-rasterizer"])

    # iPhone 12 Pro
    context = await browser.new_context(
        viewport={'width': 390, 'height': 844},
        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
    )

    page = await context.new_page()

    # Listen for console logs
    page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))

    # Disable LiquidEther before it starts if possible, or just hide it
    await page.add_init_script("window.LiquidEther = function() { return { stop: function(){} }; };")

    path = os.path.abspath("index.html")
    print(f"Opening file://{path}")
    await page.goto(f"file://{path}")

    # Wait for the project grid to be populated
    print("Waiting for .card...") # Cards are the project items
    try:
        await page.wait_for_selector(".card", timeout=15000)
        print("Found .card")
    except Exception as e:
        print(f"Timed out waiting for .card: {e}")
        # Let's see what IS on the page
        content = await page.content()
        # print(content[:1000])
        await page.screenshot(path="verification/timeout_debug_mobile.png")
        await browser.close()
        await async_playwright_ctx.stop()
        return

    # Click the project 'water' (Thin Layer)
    print("Clicking project...")
    # The selector should be .card[data-project="water"]
    await page.click('.card[data-project="water"]')

    # Wait for modal overlay to show
    print("Waiting for #overlay.show...")
    await page.wait_for_selector("#overlay.show", timeout=10000)

    # Wait for track to be populated
    await page.wait_for_selector(".viewport-track .slide-wrapper", timeout=10000)

    # Wait a bit for images to load
    await asyncio.sleep(5)

    print("Taking screenshot...")
    await page.screenshot(path="verification/modal_mobile.png")

    await browser.close()
    await async_playwright_ctx.stop()
    print("Done")

if __name__ == "__main__":
    asyncio.run(run())
