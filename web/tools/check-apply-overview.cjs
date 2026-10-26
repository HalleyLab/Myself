const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'apply.html'), 'utf8');
const routes = [...html.matchAll(/data-flow-tab="(tab\d+)"/g)].map(match => match[1]);
assert.equal([...html.matchAll(/data-flow-step="\d+"/g)].length, 8);
assert.equal([...html.matchAll(/class="flow-lane"/g)].length, 4);
assert.equal([...html.matchAll(/class="expand-menu-header"/g)].length, 53);
assert.equal([...html.matchAll(/<section class="general-content/g)].length, 10);
assert.equal([...html.matchAll(/id="tab\d+"/g)].length, 10);
routes.forEach(route => assert.ok(html.includes('data-tab="' + route + '"'), route));
let handleClick;
let selected;
let focused;
let scrolled;
let lookups = 0;
const context = {
    document: {
        addEventListener(type, listener) { assert.equal(type, 'click'); handleClick = listener; },
        querySelector(selector) {
            lookups++;
            const match = selector.match(/data-tab="(tab\d+)"/);
            if (!match || !routes.includes(match[1])) return null;
            return { click() { selected = match[1]; }, focus() { focused = match[1]; } };
        },
        getElementById(id) { return {scrollIntoView(options) { assert.equal(options.block, 'start'); scrolled = id; }}; }
    }
};
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/apply-overview.js'), 'utf8'), context);
handleClick({target: {closest() {return null;}}});
assert.equal(lookups, 0, 'Unrelated clicks must be ignored');
for (const route of new Set(routes)) {
    handleClick({target: {closest() {return {dataset: {flowTab: route}};}}});
    assert.equal(selected, route, 'Each map node must open the existing category');
    assert.equal(focused, route, 'Keyboard focus must follow the selected category');
    assert.equal(scrolled, route, 'The selected chapter must scroll into view');
}
const beforeUnknown = selected;
handleClick({target: {closest() {return {dataset: {flowTab: 'tab99'}};}}});
assert.equal(selected, beforeUnknown, 'Unknown destinations must be ignored');
console.log('8 steps, 4 parallel tracks, preserved chapters and category navigation: passed');
