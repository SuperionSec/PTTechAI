import re


def normalize_api_resource(method: str, path: str) -> str:
    return f"{method.upper()} {path}"


def _pattern_to_regex(pattern_path: str) -> re.Pattern[str]:
    escaped = re.escape(pattern_path)
    escaped = re.sub(r"\\\{[^/]+\\\}", r"[^/]+", escaped)
    escaped = escaped.replace(r"\*", ".*")
    return re.compile(f"^{escaped}$")


def match_api_resource(pattern: str, resource: str) -> bool:
    pattern_method, _, pattern_path = pattern.partition(" ")
    resource_method, _, resource_path = resource.partition(" ")
    if pattern_method.upper() != resource_method.upper():
        return False
    if pattern_path == resource_path:
        return True
    return bool(_pattern_to_regex(pattern_path).match(resource_path))


def resource_specificity(pattern: str) -> tuple[int, int]:
    _, _, path = pattern.partition(" ")
    wildcard_count = path.count("*") + len(re.findall(r"\{[^/]+\}", path))
    return (-wildcard_count, len(path))


def find_best_api_matches(patterns: list[str], method: str, path: str) -> list[str]:
    resource = normalize_api_resource(method, path)
    matches = [pattern for pattern in patterns if match_api_resource(pattern, resource)]
    return sorted(matches, key=resource_specificity, reverse=True)
