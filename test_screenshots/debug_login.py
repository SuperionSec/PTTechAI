from playwright.sync_api import sync_playwright
import os, time

chrome_path = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
screenshot_dir = r'e:\code\PTTechAI\test_screenshots'
os.makedirs(screenshot_dir, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=chrome_path, headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 720})
    page = context.new_page()

    # Go to login page and debug
    page.goto('http://localhost:3000/login', timeout=15000)
    time.sleep(3)
    
    # Debug: print all inputs and buttons
    inputs = page.query_selector_all('input')
    for i, inp in enumerate(inputs):
        itype = inp.get_attribute('type') or ''
        iname = inp.get_attribute('name') or ''
        iplaceholder = inp.get_attribute('placeholder') or ''
        print(f'Input {i}: type={itype}, name={iname}, placeholder={iplaceholder}')
    
    buttons = page.query_selector_all('button')
    for i, btn in enumerate(buttons):
        text = btn.inner_text()
        btype = btn.get_attribute('type') or ''
        print(f'Button {i}: type={btype}, text={text}')
    
    page.screenshot(path=os.path.join(screenshot_dir, 'debug_login_page.png'), full_page=True)
    
    # Try to fill login form
    email_input = page.query_selector('input[type="email"]')
    if not email_input:
        email_input = page.query_selector('input[name="email"]')
    if not email_input:
        email_input = page.query_selector('input[placeholder*="mail"]')
    if not email_input:
        all_inputs = page.query_selector_all('input')
        for inp in all_inputs:
            itype = inp.get_attribute('type') or ''
            if itype in ('text', 'email', ''):
                email_input = inp
                break
    
    password_input = page.query_selector('input[type="password"]')
    
    print(f'\nEmail input found: {email_input is not None}')
    print(f'Password input found: {password_input is not None}')
    
    if email_input:
        email_input.fill('admin@bctech.ai')
        print('Filled email')
    if password_input:
        password_input.fill('admin123')
        print('Filled password')
    
    page.screenshot(path=os.path.join(screenshot_dir, 'debug_login_filled.png'), full_page=True)
    
    # Click login button
    submit_btn = page.query_selector('button[type="submit"]')
    if not submit_btn:
        submit_btn = page.query_selector('button:has-text("Login")')
    if not submit_btn:
        submit_btn = page.query_selector('button:has-text("Sign")')
    if not submit_btn:
        submit_btn = page.query_selector('button:has-text("登录")')
    
    if submit_btn:
        print(f'Clicking submit button: {submit_btn.inner_text()}')
        submit_btn.click()
        time.sleep(5)
        
        # Check console errors
        print(f'After login - URL: {page.url}')
        print(f'After login - Title: {page.title()}')
        page.screenshot(path=os.path.join(screenshot_dir, 'debug_after_login.png'), full_page=True)
        
        # Check for error messages on page
        error_el = page.query_selector('.error, .alert, [role="alert"], .text-red, .text-destructive')
        if error_el:
            print(f'Error message: {error_el.inner_text()}')
    else:
        print('No submit button found!')
    
    browser.close()
