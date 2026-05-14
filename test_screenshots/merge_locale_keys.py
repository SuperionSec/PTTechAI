import json
import sys

def find_duplicate_top_keys(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    key_lines = {}
    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if stripped.startswith('"') and ':' in stripped:
            key = stripped.split('":')[0].strip('"')
            if key not in key_lines:
                key_lines[key] = []
            key_lines[key].append(i)
    
    duplicates = {k: v for k, v in key_lines.items() if len(v) > 1}
    return duplicates

def merge_duplicate_keys(filepath, output_path):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    data = json.loads(content)
    
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    top_key_positions = {}
    brace_depth = 0
    current_top_key = None
    
    for i, line in enumerate(lines):
        stripped = line.strip()
        for ch in stripped:
            if ch == '{':
                brace_depth += 1
            elif ch == '}':
                brace_depth -= 1
        
        if brace_depth == 1 and stripped.startswith('"') and '":' in stripped and not stripped.startswith('" "'):
            key = stripped.split('":')[0].strip('"')
            if key not in top_key_positions:
                top_key_positions[key] = []
            top_key_positions[key].append(i + 1)
    
    duplicates = {k: v for k, v in top_key_positions.items() if len(v) > 1}
    
    if not duplicates:
        print(f"No duplicate top-level keys found in {filepath}")
        return
    
    print(f"Found duplicate keys: {list(duplicates.keys())}")
    
    for key, positions in duplicates.items():
        print(f"  {key}: appears at lines {positions}")
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"Merged JSON written to {output_path}")
    print(f"Result: {len(data)} top-level keys")

en_path = r'e:\code\PTTechAI\frontend\src\locales\en-US.json'
zh_path = r'e:\code\PTTechAI\frontend\src\locales\zh-CN.json'

print("=== en-US.json ===")
merge_duplicate_keys(en_path, en_path)

print("\n=== zh-CN.json ===")
merge_duplicate_keys(zh_path, zh_path)

print("\n=== Verifying no duplicates remain ===")
for path in [en_path, zh_path]:
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    key_lines = {}
    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if stripped.startswith('"') and ':' in stripped:
            key = stripped.split('":')[0].strip('"')
            if key not in key_lines:
                key_lines[key] = []
            key_lines[key].append(i)
    
    duplicates = {k: v for k, v in key_lines.items() if len(v) > 1}
    if duplicates:
        print(f"STILL HAS DUPLICATES in {path}: {list(duplicates.keys())}")
    else:
        print(f"OK - No duplicate top-level keys in {path}")

print("\n=== Comparing key paths between en-US and zh-CN ===")
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

only_in_en = en_keys - zh_keys
only_in_zh = zh_keys - en_keys

if only_in_en:
    print(f"Keys only in en-US ({len(only_in_en)}):")
    for k in sorted(only_in_en)[:20]:
        print(f"  {k}")
    if len(only_in_en) > 20:
        print(f"  ... and {len(only_in_en) - 20} more")

if only_in_zh:
    print(f"Keys only in zh-CN ({len(only_in_zh)}):")
    for k in sorted(only_in_zh)[:20]:
        print(f"  {k}")
    if len(only_in_zh) > 20:
        print(f"  ... and {len(only_in_zh) - 20} more")

if not only_in_en and not only_in_zh:
    print("Key paths are identical between en-US and zh-CN!")
