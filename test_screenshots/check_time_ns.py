import json

en_path = r'e:\code\PTTechAI\frontend\src\locales\en-US.json'
with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

print('Existing time namespace:')
print(json.dumps(en_data.get('time', {}), indent=2, ensure_ascii=False))
