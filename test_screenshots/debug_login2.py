from playwright.sync_api import sync_playwright
import os, time, json

chrome_path = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
screenshot_dir = r'e:\code\PTTechAI\test_screenshots'

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=chrome_path, headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 720})
    page = context.new_page()

    # Capture console logs and network requests
    console_logs = []
    page.on('console', lambda msg: console_logs.append(f'[{msg.type}] {msg.text}'))
    
    network_requests = []
    page.on('request', lambda req: network_requests.append(f'{req.method} {req.url}'))
    network_responses = []
    page.on('response', lambda resp: network_responses.append(f'{resp.status} {resp.url}'))

    page.goto('http://localhost:3000/login', timeout=15000)
    time.sleep(2)

    # Fill and submit
    page.query_selector('input[type="email"]').fill('admin@bctech.ai')
    page.query_selector('input[type="password"]').fill('admin123')
    page.query_selector('button[type="submit"]').click()
    time.sleep(5)

    # Print network activity
    print('=== Network Requests ===')
    for req in network_requests[-20:]:
        print(req)
    
    print('\n=== Network Responses ===')
    for resp in network_responses[-20:]:
        print(resp)
    
    print('\n=== Console Logs ===')
    for log in console_logs[-20:]:
        print(log)
    
    page.screenshot(path=os.path.join(screenshot_dir, 'debug_login_network.png'), full_page=True)
    print(f'\nFinal URL: {page.url}')
    
    browser.close()
