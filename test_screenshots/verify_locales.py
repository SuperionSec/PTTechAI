import json

en_path = r'e:\code\PTTechAI\frontend\src\locales\en-US.json'
zh_path = r'e:\code\PTTechAI\frontend\src\locales\zh-CN.json'

def get_all_keys(obj, prefix=''):
    keys = set()
    for k, v in obj.items():
        full_key = f"{prefix}.{k}" if prefix else k
        keys.add(full_key)
        if isinstance(v, dict):
            keys.update(get_all_keys(v, full_key))
    return keys

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)
with open(zh_path, 'r', encoding='utf-8') as f:
    zh_data = json.load(f)

en_keys = get_all_keys(en_data)
zh_keys = get_all_keys(zh_data)

only_in_en = sorted(en_keys - zh_keys)
only_in_zh = sorted(zh_keys - en_keys)

print(f"en-US total keys: {len(en_keys)}")
print(f"zh-CN total keys: {len(zh_keys)}")
print()

if only_in_en:
    print(f"Keys only in en-US ({len(only_in_en)}):")
    for k in only_in_en:
        print(f"  {k}")
    print()

if only_in_zh:
    print(f"Keys only in zh-CN ({len(only_in_zh)}):")
    for k in only_in_zh:
        print(f"  {k}")
    print()

if not only_in_en and not only_in_zh:
    print("Key paths are identical!")

# Check for duplicate top-level keys
with open(en_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

top_keys = []
for line in lines:
    stripped = line.strip()
    if stripped.startswith('"') and '":' in stripped:
        key = stripped.split('":')[0].strip('"')
        top_keys.append(key)

dupes = {}
for k in top_keys:
    dupes[k] = dupes.get(k, 0) + 1
dupes = {k: v for k, v in dupes.items() if v > 1}

if dupes:
    print(f"Duplicate top-level keys found: {dupes}")
else:
    print("No duplicate top-level keys found.")
