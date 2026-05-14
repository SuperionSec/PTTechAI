import json

en_path = r'e:\code\PTTechAI\frontend\src\locales\en-US.json'
zh_path = r'e:\code\PTTechAI\frontend\src\locales\zh-CN.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)
with open(zh_path, 'r', encoding='utf-8') as f:
    zh_data = json.load(f)

vuln_agent_en = {
    'notEnabled': 'Per-vulnerability agent orchestration is not enabled for this scan.',
    'enableHint': 'Set ENABLE_VULN_AGENTS=true in .env to enable',
    'title': 'Vulnerability Agents',
    'done': 'done',
    'running': 'running',
    'failed': 'failed',
    'pending': 'pending',
    'findings': 'findings',
    'status': 'Status',
    'targets': 'Targets',
    'findingCount': 'finding(s)',
    'duration': 'Duration',
    'error': 'Error',
}

vuln_agent_zh = {
    'notEnabled': '此扫描未启用逐漏洞 Agent 编排。',
    'enableHint': '在 .env 中设置 ENABLE_VULN_AGENTS=true 以启用',
    'title': '漏洞 Agent',
    'done': '已完成',
    'running': '运行中',
    'failed': '失败',
    'pending': '等待中',
    'findings': '发现',
    'status': '状态',
    'targets': '目标',
    'findingCount': '个发现',
    'duration': '耗时',
    'error': '错误',
}

en_data['vulnAgent'] = vuln_agent_en
zh_data['vulnAgent'] = vuln_agent_zh

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, ensure_ascii=False, indent=2)

with open(zh_path, 'w', encoding='utf-8') as f:
    json.dump(zh_data, f, ensure_ascii=False, indent=2)

print('Added vulnAgent namespace to both locale files')
