import json

en_path = r'e:\code\PTTechAI\frontend\src\locales\en-US.json'

with open(en_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

top_keys = []
for i, line in enumerate(lines, 1):
    # Only check lines with exactly 2-space indent (top-level keys)
    if line.startswith('  "') and '":' in line and not line.startswith('    '):
        key = line.strip().split('":')[0].strip('"')
        top_keys.append((i, key))

dupes = {}
for line_num, key in top_keys:
    if key not in dupes:
        dupes[key] = []
    dupes[key].append(line_num)

dupes = {k: v for k, v in dupes.items() if len(v) > 1}

if dupes:
    print(f"Duplicate TOP-LEVEL keys found ({len(dupes)}):")
    for k, v in dupes.items():
        print(f"  {k}: lines {v}")
else:
    print("No duplicate top-level keys found.")

print(f"\nTotal top-level keys: {len(set(k for _, k in top_keys))}")
