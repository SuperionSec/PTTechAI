import json

en_path = r'e:\code\PTTechAI\frontend\src\locales\en-US.json'
zh_path = r'e:\code\PTTechAI\frontend\src\locales\zh-CN.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)
with open(zh_path, 'r', encoding='utf-8') as f:
    zh_data = json.load(f)

new_keys = {
    'auth': {
        'serviceAccount': 'Service Account',
        'serviceAccountDesc': 'This account is for API access only and cannot be used to access the web interface.',
        'serviceAccountHint': 'Please use the API with your access token for programmatic access.',
    }
}

new_zh_keys = {
    'auth': {
        'serviceAccount': '服务账号',
        'serviceAccountDesc': '此账号仅用于 API 访问，无法使用 Web 界面。',
        'serviceAccountHint': '请使用您的访问令牌通过 API 进行程序化访问。',
    }
}

for ns, keys in new_keys.items():
    if ns not in en_data:
        en_data[ns] = {}
    en_data[ns].update(keys)

for ns, keys in new_zh_keys.items():
    if ns not in zh_data:
        zh_data[ns] = {}
    zh_data[ns].update(keys)

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, ensure_ascii=False, indent=2)

with open(zh_path, 'w', encoding='utf-8') as f:
    json.dump(zh_data, f, ensure_ascii=False, indent=2)

print('Added auth.serviceAccount/serviceAccountDesc/serviceAccountHint to both locale files')
