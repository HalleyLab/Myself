"""Check page coverage and language-switch regressions without dependencies."""
import json
import re
import subprocess
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = [ROOT / name for name in (
    "home.html", "homepage.html", "general_course.html", "required.html",
    "selective.html", "others.html", "mixed.html", "apply.html", "jhubmb.html",
    "protocols.html", "instructions.html", "notes.html",
)] + sorted((ROOT / "course_materials").glob("*.html"))


class PageText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hidden = 0
        self.text = []
        self.scripts = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ("script", "style"):
            self.hidden += 1
        if tag == "script" and "src" in attrs:
            self.scripts.append(attrs)
        for key in ("placeholder", "title", "alt", "aria-label", "aria-valuetext", "data-tooltip"):
            if attrs.get(key):
                self.text.append(attrs[key])
        if tag == "input" and attrs.get("type", "").lower() in ("button", "submit", "reset"):
            self.text.append(attrs.get("value", ""))

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.hidden -= 1

    def handle_data(self, data):
        if not self.hidden:
            self.text.append(data)


texts = set()
for page in PAGES:
    parser = PageText()
    parser.feed(page.read_text(encoding="utf-8"))
    texts.update(re.sub(r"\s+", " ", item).strip() for item in parser.text)
    scripts = [item for item in parser.scripts if "js/translations-en.js" in item["src"] or "js/definition.js" in item["src"]]
    assert len(scripts) == 2 and "translations-en.js" in scripts[0]["src"], page
    for script in scripts:
        assert "defer" in script, (page, script)
        assert (page.parent / script["src"].split("?")[0]).resolve().is_file(), (page, script)

NODE_CHECK = r"""
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('js/definition.js', 'utf8');
const context = {window: {}, document: {getElementById() {return null;}}};
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/translations-en.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('js/apply-guide-en.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('js/course-notes.js', 'utf8'), context);
const maps = source.match(/const exactTranslations = (\{[\s\S]*?\n    \});/)[0] + '\n' +
    source.match(/const phraseTranslations = (\{[\s\S]*?\n    \});/)[0];
vm.runInContext(maps + '\nlet translationTerms;\n' +
    source.slice(source.indexOf('    function translateText(text)'), source.indexOf('    function observeDynamicText()')) +
    source.slice(source.indexOf('    function localizeValue('), source.indexOf('    function updateLanguageButton(')), context);
const strings = JSON.parse(fs.readFileSync(0, 'utf8'));
function collect(value) {
    if (typeof value === 'string') strings.push(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
}
collect(context.window.courseNotesData);
collect(JSON.parse(fs.readFileSync('songs/playlist.json', 'utf8')).map(name => name.replace(/\.[^.]+$/, '')));
strings.push('音量：65%', '未找到可播放的音乐文件', '31 门课程');
const uncovered = [...new Set(strings)].filter(text => /[\u3400-\u9fff\u3040-\u30ff]/.test(context.translateText(text)));
assert.deepEqual(uncovered, [], 'Untranslated page, note or player text');
assert.equal(context.translateText('  你好呀  '), '  Hello  ');
assert.equal(context.translateText('Already English'), 'Already English');
assert.equal(context.translateText('0 门课程'), '0 courses');
assert.equal(context.translateText('1 门课程'), '1 course');
assert.equal(context.translateText('33 门课程'), '33 courses');
let record = context.localizeValue(undefined, '你好呀', true);
assert.equal(record.last, 'Hello');
record = context.localizeValue(record, record.last, false);
assert.equal(record.last, '你好呀');
record = context.localizeValue(record, '欢迎来我的网站', true);
assert.equal(record.last, 'Welcome to my website');
record = context.localizeValue(record, record.last, false);
assert.equal(record.last, '欢迎来我的网站', 'New content must replace the remembered source');
record = context.localizeValue(record, 'Authored English', false);
assert.equal(record.last, 'Authored English');
record = context.localizeValue(undefined, '音量：10%', true);
record = context.localizeValue(record, '音量：65%', true);
record = context.localizeValue(record, record.last, false);
assert.equal(record.last, '音量：65%', 'Changing tooltips must retain the latest value');
const storage = new Map(), applied = [];
context.localStorage = {setItem: (key, value) => storage.set(key, value), getItem: key => storage.get(key)};
context.updateLanguageButton = () => {};
context.applyLanguage = language => applied.push(language);
let resolveDictionary;
context.ensureEnglishTranslations = () => new Promise(resolve => {resolveDictionary = resolve;});
vm.runInContext("let languageChangeId = 0; const languageKey = 'siteLanguage';\n" +
    source.slice(source.indexOf('    function setLanguage('), source.indexOf('    function synchronizeLanguageUi(')) +
    source.slice(source.indexOf('    function getStoredLanguage('), source.indexOf('    function ensureEnglishTranslations(')), context);
(async () => {
    context.setLanguage('en'); context.setLanguage('zh'); resolveDictionary();
    await Promise.resolve();
    assert.deepEqual(applied, ['zh'], 'An outdated English request must not override a newer choice');
    context.setLanguage('en'); resolveDictionary(); await Promise.resolve();
    assert.deepEqual(applied, ['zh', 'en']);
    console.log(JSON.stringify({pages: 45, strings: new Set(strings).size, untranslated: uncovered.length, regressions: 'passed'}));
})().catch(error => {console.error(error); process.exitCode = 1;});
"""
subprocess.run(["node", "--check", "js/definition.js"], cwd=ROOT, check=True)
subprocess.run(["node", "--check", "js/course-notes.js"], cwd=ROOT, check=True)
subprocess.run(["node", "-e", NODE_CHECK], input=json.dumps(sorted(texts)), text=True,
               encoding="utf-8", cwd=ROOT, check=True)
