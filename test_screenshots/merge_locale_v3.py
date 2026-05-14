import json
import copy

def merge_locale_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.split('\n')
    
    top_key_starts = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        if line.startswith('  "') and '":' in stripped and not line.startswith('    '):
            key = stripped.split('":')[0].strip('"')
            top_key_starts.append((i, key))
    
    group_by_key = {}
    for i, (line_idx, key) in enumerate(top_key_starts):
        if key not in group_by_key:
            group_by_key[key] = []
        group_by_key[key].append(line_idx)
    
    duplicates = {k: v for k, v in group_by_key.items() if len(v) > 1}
    print(f"Duplicate top-level keys: {list(duplicates.keys())}")
    for k, v in duplicates.items():
        print(f"  {k}: lines {[x+1 for x in v]}")
    
    data = json.loads(content)
    
    for key, line_indices in duplicates.items():
        blocks = []
        for idx, line_idx in enumerate(line_indices):
            next_line_idx = line_indices[idx + 1] if idx + 1 < len(line_indices) else len(lines)
            
            start_char = None
            end_char = None
            brace_depth = 0
            found_first_brace = False
            
            for li in range(line_idx, next_line_idx):
                for ch in lines[li]:
                    if ch == '{':
                        if not found_first_brace:
                            found_first_brace = True
                            start_char = sum(len(lines[l]) + 1 for l in range(li)) + lines[li].index('{')
                        brace_depth += 1
                    elif ch == '}':
                        brace_depth -= 1
                        if brace_depth == 0 and found_first_brace:
                            end_char = sum(len(lines[l]) + 1 for l in range(li)) + lines[li].index('}', lines[li].rindex('}'))
                            break
                if end_char is not None:
                    break
            
            if start_char is not None and end_char is not None:
                block_json = content[start_char:end_char+1]
                try:
                    block_data = json.loads(block_json)
                    blocks.append(block_data)
                except json.JSONDecodeError:
                    pass
        
        if len(blocks) >= 2:
            merged = {}
            for block in blocks:
                merged.update(block)
            
            original_count = len(data.get(key, {}))
            data[key] = merged
            new_count = len(merged)
            print(f"  Merged {key}: {original_count} -> {new_count} keys (was using last block only)")
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"Written to {filepath}")

en_path = r'e:\code\PTTechAI\frontend\src\locales\en-US.json'
zh_path = r'e:\code\PTTechAI\frontend\src\locales\zh-CN.json'

print("=== en-US.json ===")
merge_locale_file(en_path)

print("\n=== zh-CN.json ===")
merge_locale_file(zh_path)

print("\n=== Verification ===")
for path in [en_path, zh_path]:
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    key_count = {}
    for line in lines:
        if line.startswith('  "') and '":' in line.strip() and not line.startswith('    '):
            k = line.strip().split('":')[0].strip('"')
            key_count[k] = key_count.get(k, 0) + 1
    
    dupes = {k: v for k, v in key_count.items() if v > 1}
    name = path.split('\\')[-1]
    if dupes:
        print(f"STILL DUPLICATES in {name}: {dupes}")
    else:
        print(f"OK - {name}: {len(data)} top-level keys, no duplicates")

print("\n=== Key path alignment ===")
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

if only_in_en:
    print(f"Keys only in en-US ({len(only_in_en)}):")
    for k in only_in_en:
        print(f"  {k}")

if only_in_zh:
    print(f"Keys only in zh-CN ({len(only_in_zh)}):")
    for k in only_in_zh:
        print(f"  {k}")

if not only_in_en and not only_in_zh:
    print("Key paths are identical!")
