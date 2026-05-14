import json

en_path = r'e:\code\PTTechAI\frontend\src\locales\en-US.json'
zh_path = r'e:\code\PTTechAI\frontend\src\locales\zh-CN.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)
with open(zh_path, 'r', encoding='utf-8') as f:
    zh_data = json.load(f)

role_keys_en = {
    'role_admin': 'Admin',
    'role_user': 'User',
    'role_viewer': 'Viewer',
    'role_service': 'Service',
}

role_keys_zh = {
    'role_admin': '管理员',
    'role_user': '用户',
    'role_viewer': '观察者',
    'role_service': '服务账号',
}

en_data['common'].update(role_keys_en)
zh_data['common'].update(role_keys_zh)

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, ensure_ascii=False, indent=2)
with open(zh_path, 'w', encoding='utf-8') as f:
    json.dump(zh_data, f, ensure_ascii=False, indent=2)

print('Added role translation keys to common namespace')
