"""Offline regression tests for the live crawler audit's failure signals."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('crawler_audit', Path(__file__).with_name('audit-public-crawlers.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class CrawlerProbeTest(unittest.TestCase):
    def run_probe(self, body, status='200', kind='text/html', path='/about', agent='OAI-SearchBot/1.4'):
        response = SimpleNamespace(returncode=0, stdout=body+'\n'+status+'\t'+kind+'\thttps://startajump.com'+path, stderr='')
        with patch.object(audit.subprocess, 'run', return_value=response):
            return audit.probe('https://startajump.com', agent, path)

    def test_flags_empty_shell_and_missing_canonical(self):
        result = self.run_probe('<html><div id="root"></div></html>')
        self.assertIn('empty_app_root', result['errors'])
        self.assertIn('missing_readable_public_html', result['errors'])
        self.assertIn('missing_canonical', result['errors'])

    def test_detects_crawler_denial_and_challenge(self):
        self.assertIn('unexpected_http_status', self.run_probe('denied', status='403')['errors'])
        self.assertIn('possible_bot_challenge', self.run_probe('<title>Just a moment</title>')['errors'])

    def test_validates_robots_and_training_independently(self):
        body='User-agent: *\nAllow: /\nUser-agent: GPTBot\nDisallow: /\n'
        self.assertEqual(self.run_probe(body, kind='text/plain', path='/robots.txt')['errors'], [])
        self.assertTrue(self.run_probe('blocked',status='403',agent='GPTBot/1.4')['observationalOnly'])
        blocked='User-agent: OAI-SearchBot\nDisallow: /\n'
        self.assertIn('public_search_crawl_disallowed', self.run_probe(blocked,kind='text/plain',path='/robots.txt')['errors'])

    def test_validates_xml_instead_of_accepting_successful_html(self):
        result=self.run_probe('<html></html>',path='/sitemap.xml')
        self.assertIn('sitemap_content_type',result['errors'])
        valid='<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>'
        self.assertEqual(self.run_probe(valid,kind='application/xml',path='/sitemap.xml')['errors'],[])

    def test_accepts_readable_public_html_without_js(self):
        body='<html><head><link rel="canonical" href="https://startajump.com/about"></head><body><h1>About Jump</h1><p>Public facts.</p></body></html>'
        self.assertEqual(self.run_probe(body,kind='text/html; charset=utf-8')['errors'],[])


if __name__ == '__main__':
    unittest.main()
