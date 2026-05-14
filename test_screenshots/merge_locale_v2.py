import json
import re
import sys

def parse_json_with_duplicates(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    top_level_blocks = {}
    brace_depth = 0
    current_key = None
    block_start = None
    in_string = False
    escape_next = False
    
    i = 0
    while i < len(content):
        ch = content[i]
        
        if escape_next:
            escape_next = False
            i += 1
            continue
        
        if ch == '\\':
            escape_next = True
            i += 1
            continue
        
        if ch == '"':
            in_string = not in_string
            i += 1
            continue
        
        if in_string:
            i += 1
            continue
        
        if ch == '{':
            if brace_depth == 0:
                pass
            elif brace_depth == 1:
                block_start = i
            brace_depth += 1
        elif ch == '}':
            brace_depth -= 1
            if brace_depth == 1 and current_key and block_start is not None:
                block_content = content[block_start:i+1]
                if current_key not in top_level_blocks:
                    top_level_blocks[current_key] = []
                top_level_blocks[current_key].append(block_content)
                block_start = None
        elif ch == ',' and brace_depth == 1:
            pass
        
        if brace_depth == 1 and ch == '"':
            key_match = re.match(r'"([^"]+)"\s*:', content[i:])
            if key_match:
                current_key = key_match.group(1)
        
        i += 1
    
    return top_level_blocks

def merge_locale_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    duplicate_keys = ['autoPentest', 'realtimeTask', 'vulnLab', 'providers']
    
    for key in duplicate_keys:
        key_lines = []
        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped.startswith(f'"{key}"') and ':' in stripped:
                key_lines.append(i)
        
        if len(key_lines) < 2:
            print(f"  {key}: only {len(key_lines)} occurrence(s), skipping")
            continue
        
        print(f"  {key}: found at lines {[l+1 for l in key_lines]}")
        
        first_block = extract_block(lines, key_lines[0])
        second_block = extract_block(lines, key_lines[1])
        
        try:
            first_data = json.loads('{' + first_block + '}')
            second_data = json.loads('{' + second_block + '}')
            
            first_keys = set(first_data.get(key, {}).keys())
            second_keys = set(second_data.get(key, {}).keys())
            
            only_in_first = first_keys - second_keys
            only_in_second = second_keys - first_keys
            
            if only_in_first:
                print(f"    Keys only in first block: {only_in_first}")
                merged = {**first_data[key], **second_data[key]}
                data[key] = merged
                print(f"    Merged! Total keys: {len(merged)}")
            else:
                print(f"    No unique keys in first block, second block is superset")
        except json.JSONDecodeError as e:
            print(f"    Error parsing blocks: {e}")
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"  Written to {filepath}")

def extract_block(lines, start_line):
    brace_depth = 0
    block_chars = []
    found_open = False
    
    for i in range(start_line, len(lines)):
        line = lines[i]
        for ch in line:
            if ch == '{':
                brace_depth += 1
                found_open = True
            elif ch == '}':
                brace_depth -= 1
            
            if found_open:
                block_chars.append(ch)
            
            if found_open and brace_depth == 0:
                return ''.join(block_chars)
    
    return ''

en_path = r'e:\code\PTTechAI\frontend\src\locales\en-US.json'
zh_path = r'e:\code\PTTechAI\frontend\src\locales\zh-CN.json'

print("=== Merging en-US.json ===")
merge_locale_file(en_path)

print("\n=== Merging zh-CN.json ===")
merge_locale_file(zh_path)

print("\n=== Final verification ===")
for path in [en_path, zh_path]:
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    key_count = {}
    for line in lines:
        stripped = line.strip()
        match = re.match(r'^  "([^"]+)": \{', stripped)
        if match:
            k = match.group(1)
            key_count[k] = key_count.get(k, 0) + 1
    
    dupes = {k: v for k, v in key_count.items() if v > 1}
    if dupes:
        print(f"STILL HAS DUPLICATES in {path}: {dupes}")
    else:
        print(f"OK - No duplicate top-level keys in {path} ({len(data)} keys)")

print("\n=== Key path comparison ===")
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
    for k in sorted(only_in_en):
        print(f"  {k}")

if only_in_zh:
    print(f"Keys only in zh-CN ({len(only_in_zh)}):")
    for k in sorted(only_in_zh):
        print(f"  {k}")

if not only_in_en and not only_in_zh:
    print("Key paths are identical!")
