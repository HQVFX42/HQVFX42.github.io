"""Refresh the public GitHub contribution snapshot. No token or third-party proxy."""
import datetime
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import urllib.request

SOURCE = 'https://github.com/users/HQVFX42/contributions'


class Contributions(HTMLParser):
    def __init__(self):
        super().__init__()
        self.days = {}
        self.counts = {}
        self.tooltip = None
        self.text = ''

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'td' and attrs.get('data-date'):
            self.days[attrs['id']] = {'date': attrs['data-date'], 'level': int(attrs['data-level'])}
        if tag == 'tool-tip' and attrs.get('for', '').startswith('contribution-day-'):
            self.tooltip = attrs['for']
            self.text = ''

    def handle_data(self, data):
        if self.tooltip:
            self.text += data

    def handle_endtag(self, tag):
        if tag == 'tool-tip' and self.tooltip:
            match = re.match(r'\s*([\d,]+|No) contributions?\b', self.text)
            if not match:
                raise ValueError(f'Unknown contribution label: {self.text}')
            self.counts[self.tooltip] = 0 if match[1] == 'No' else int(match[1].replace(',', ''))
            self.tooltip = None


def main():
    request = urllib.request.Request(SOURCE, headers={'User-Agent': 'INHO-Portfolio'})
    with urllib.request.urlopen(request, timeout=30) as response:
        markup = response.read().decode('utf-8')
    parser = Contributions()
    parser.feed(markup)
    if len(parser.days) < 350 or set(parser.days) != set(parser.counts):
        raise ValueError('Incomplete calendar; existing snapshot was not modified.')
    days = sorted([{**day, 'count': parser.counts[key]} for key, day in parser.days.items()], key=lambda d: d['date'])
    snapshot = {'username': 'HQVFX42', 'source': SOURCE,
                'fetchedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'total': sum(day['count'] for day in days), 'days': days}
    target = Path(__file__).resolve().parents[1] / 'assets' / 'activity-data.js'
    target.write_text('window.PORTFOLIO_ACTIVITY = ' + json.dumps(snapshot, ensure_ascii=False, indent=2) + ';\n', encoding='utf-8')
    print(f'Updated {len(days)} days from {days[0]["date"]} to {days[-1]["date"]}; {snapshot["total"]} contributions.')


if __name__ == '__main__':
    main()
