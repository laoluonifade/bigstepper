#!/usr/bin/env python3
"""Repeatable public HTTPS probe. A user-agent simulation is not proof of real crawler access."""
import argparse
import concurrent.futures
import json
import re
import subprocess
import sys
import urllib.parse
import urllib.robotparser
import xml.etree.ElementTree as ET

AGENTS = ['Mozilla/5.0', 'OAI-SearchBot/1.4', 'Googlebot/2.1', 'bingbot/2.0', 'PerplexityBot/1.0', 'GPTBot/1.4']
PATHS = ['/', '/business', '/about', '/learn', '/learn/phone-walking-competitions', '/robots.txt', '/sitemap.xml']


def probe(base, agent, path):
    result = subprocess.run(['curl', '--silent', '--show-error', '--location', '--max-redirs', '4', '--max-time', '25', '--proto', '=https', '--proto-redir', '=https', '--user-agent', agent, '--write-out', '\n%{http_code}\t%{content_type}\t%{url_effective}', base + path], capture_output=True, text=True)
    body, _, status = result.stdout.rpartition('\n')
    fields = status.split('\t', 2)
    errors = []
    if result.returncode or len(fields) != 3:
        return {'agent': agent, 'path': path, 'errors': ['request_failed'], 'detail': result.stderr.strip()}
    code, content_type, effective_url = fields
    if agent == 'GPTBot/1.4':
        return {'agent': agent, 'path': path, 'status': int(code), 'contentType': content_type, 'url': effective_url, 'bytes': len(body.encode()), 'observationalOnly': True, 'errors': []}
    if code != '200':
        errors.append('unexpected_http_status')
    if urllib.parse.urlsplit(effective_url).hostname != urllib.parse.urlsplit(base).hostname:
        errors.append('unexpected_redirect_host')
    if path == '/robots.txt':
        if 'text/plain' not in content_type or '<html' in body.lower():
            errors.append('robots_is_not_plain_text')
        else:
            robots = urllib.robotparser.RobotFileParser()
            robots.parse(body.splitlines())
            # GPTBot is observed separately, not required to be allowed for search.
            if agent != 'GPTBot/1.4' and not robots.can_fetch(agent, base + '/about'):
                errors.append('public_search_crawl_disallowed')
    elif path == '/sitemap.xml':
        if 'xml' not in content_type:
            errors.append('sitemap_content_type')
        try:
            root = ET.fromstring(body)
            if root.tag != '{http://www.sitemaps.org/schemas/sitemap/0.9}sitemapindex':
                errors.append('invalid_sitemap_index')
        except ET.ParseError:
            errors.append('invalid_sitemap_xml')
    else:
        if 'text/html' not in content_type or not re.search(r'<h1\b', body, re.I):
            errors.append('missing_readable_public_html')
        if re.search(r'<div\s+id=["\']root["\']>\s*</div>', body, re.I):
            errors.append('empty_app_root')
        if not re.search(r'<link\b[^>]*rel=["\']canonical["\']', body, re.I):
            errors.append('missing_canonical')
        if re.search(r'<title>\s*(just a moment|access denied|captcha)', body, re.I):
            errors.append('possible_bot_challenge')
    return {'agent': agent, 'path': path, 'status': int(code), 'contentType': content_type, 'url': effective_url, 'bytes': len(body.encode()), 'errors': errors}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='https://startajump.com')
    parser.add_argument('--output', help='Optional JSON evidence file; response bodies are not stored.')
    args = parser.parse_args()
    url = urllib.parse.urlsplit(args.base_url)
    if url.scheme != 'https' or not url.hostname or url.username or url.password or url.query or url.fragment or url.path not in ['', '/']:
        parser.error('Use a public HTTPS origin without credentials, path, query or fragment.')
    base = args.base_url.rstrip('/')
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        rows = list(executor.map(lambda pair: probe(base, *pair), [(agent, path) for agent in AGENTS for path in PATHS]))
    report = {'origin': base, 'scope': 'Synthetic user-agent probes only. Verify real vendor IPs/server logs separately; this does not prove indexing or AI visibility.', 'checks': rows}
    output = json.dumps(report, indent=2)
    if args.output:
        with open(args.output, 'w', encoding='utf8') as handle:
            handle.write(output + '\n')
    print(output)
    return int(any(row['errors'] for row in rows))


if __name__ == '__main__':
    sys.exit(main())
