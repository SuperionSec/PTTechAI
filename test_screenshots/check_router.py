import urllib.request, json

base = 'http://localhost:8000'
login_data = json.dumps({'email': 'admin@bctech.ai', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/api/v1/auth/login', data=login_data, headers={'Content-Type': 'application/json'})
r = urllib.request.urlopen(req, timeout=5)
token = json.loads(r.read())['access_token']
headers = {'Authorization': f'Bearer {token}'}

# Check providers with smart router
req = urllib.request.Request(f'{base}/api/v1/providers', headers=headers)
r = urllib.request.urlopen(req, timeout=5)
data = json.loads(r.read())
print('Providers:', json.dumps(data, indent=2, ensure_ascii=False))

# Check settings
req = urllib.request.Request(f'{base}/api/v1/settings', headers=headers)
r = urllib.request.urlopen(req, timeout=5)
data = json.loads(r.read())
print('\nSettings:', json.dumps(data, indent=2, ensure_ascii=False))
