import json

en_path = r'e:\code\PTTechAI\frontend\src\locales\en-US.json'
zh_path = r'e:\code\PTTechAI\frontend\src\locales\zh-CN.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)
with open(zh_path, 'r', encoding='utf-8') as f:
    zh_data = json.load(f)

missing_in_en = {
    'downloadZip': 'Download ZIP',
    'generatedAfterScan': 'Generated after scan completion',
    'noMatchFilters': 'No reports match your filters',
    'startNewScan': 'Start New Scan',
    'viewInBrowser': 'View in Browser'
}

for k, v in missing_in_en.items():
    en_data['reports'][k] = v
    zh_val = zh_data['reports'][k]
    print(f'Added en-US: reports.{k} = {v}')
    print(f'  zh-CN: reports.{k} = {zh_val}')

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, ensure_ascii=False, indent=2)

def get_all_keys(obj, prefix=''):
    keys = set()
    for k, v in obj.items():
        full_key = f"{prefix}.{k}" if prefix else k
        keys.add(full_key)
        if isinstance(v, dict):
            keys.update(get_all_keys(v, full_key))
    return keys

with open(en_path, 'r', encoding='utf-8') as f:
    en_data2 = json.load(f)
with open(zh_path, 'r', encoding='utf-8') as f:
    zh_data2 = json.load(f)

en_keys = get_all_keys(en_data2)
zh_keys = get_all_keys(zh_data2)

only_in_en = en_keys - zh_keys
only_in_zh = zh_keys - en_keys

if only_in_en:
    print(f'Keys only in en-US ({len(only_in_en)}): {sorted(only_in_en)}')
if only_in_zh:
    print(f'Keys only in zh-CN ({len(only_in_zh)}): {sorted(only_in_zh)}')
if not only_in_en and not only_in_zh:
    print('Key paths are now identical!')

print('Done')
