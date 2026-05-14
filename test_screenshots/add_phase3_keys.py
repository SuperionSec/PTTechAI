import json

en_path = r'e:\code\PTTechAI\frontend\src\locales\en-US.json'
zh_path = r'e:\code\PTTechAI\frontend\src\locales\zh-CN.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)
with open(zh_path, 'r', encoding='utf-8') as f:
    zh_data = json.load(f)

new_keys = {
    'agent': {
        'started': 'Started',
    },
    'scheduler': {
        'next': 'Next',
        'last': 'Last',
        'deleteConfirm': 'Are you sure you want to delete',
        'deleteCannotUndo': 'This action cannot be undone.',
    },
    'time': {
        'monthsAgo': '{months}mo ago',
    },
}

new_zh_keys = {
    'agent': {
        'started': '启动于',
    },
    'scheduler': {
        'next': '下次',
        'last': '上次',
        'deleteConfirm': '确定要删除',
        'deleteCannotUndo': '此操作无法撤销。',
    },
    'time': {
        'monthsAgo': '{months}个月前',
    },
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

print('Added missing keys for agent.started, scheduler.next/last/deleteConfirm/deleteCannotUndo, time.monthsAgo')
