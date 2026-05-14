import json

en_path = r'e:\code\PTTechAI\frontend\src\locales\en-US.json'
zh_path = r'e:\code\PTTechAI\frontend\src\locales\zh-CN.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)
with open(zh_path, 'r', encoding='utf-8') as f:
    zh_data = json.load(f)

new_time_en = {
    'secondsAgo': '{seconds}s ago',
    'unknown': 'Unknown',
}

new_time_zh = {
    'justNow': '刚刚',
    'secondsAgo': '{seconds}秒前',
    'minutesAgo': '{minutes}分钟前',
    'hoursAgo': '{hours}小时前',
    'daysAgo': '{days}天前',
    'elapsed': '耗时：{time}',
    'seconds': '秒',
    'minutes': '分钟',
    'hours': '小时',
    'days': '天',
    'unknown': '未知',
}

en_data['time'].update(new_time_en)
zh_data['time'].update(new_time_zh)

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, ensure_ascii=False, indent=2)
with open(zh_path, 'w', encoding='utf-8') as f:
    json.dump(zh_data, f, ensure_ascii=False, indent=2)

print('Updated time namespace in both locale files')
