import os
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Get the absolute path to the HTML file
        file_path = os.path.abspath('index.html')

        # Go to the local HTML file
        page.goto(f'file://{file_path}')

        # Open the modal by clicking on a project
        page.click('[data-project="mycy"]')

        # Wait for the modal to be visible
        page.wait_for_selector('#overlay.show')

        # Take a screenshot of the modal
        page.screenshot(path='jules-scratch/verification/verification.png')

        browser.close()

if __name__ == '__main__':
    run()
