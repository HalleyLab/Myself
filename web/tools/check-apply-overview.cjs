const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const motionSource = fs.readFileSync(path.join(root, 'js/handwritten.js'), 'utf8');
const pageSource = motionSource + '\n' + fs.readFileSync(path.join(root, 'js/apply-overview.js'), 'utf8');
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
    window: {matchMedia() {return {matches: true};}},
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
vm.runInNewContext(pageSource, context);
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
assert.equal([...html.matchAll(/class="flow-doodle"/g)].length, 8, 'One small illustration for each of the eight stages');
const font = fs.readFileSync(path.join(root, 'fonts/application-hand.woff2'));
assert.equal(font.subarray(0, 4).toString(), 'wOF2', 'The handwriting font must be a valid local webfont');
assert.ok(font.length < 600000, 'Use a text-specific subset for the two pages instead of a full Chinese font');
assert.ok(fs.readFileSync(path.join(root, 'fonts/application-hand-OFL.txt'), 'utf8').includes('SIL OPEN FONT LICENSE'));

function runMotion({reduced = false, supported = true} = {}) {
    const classes = () => {const values = new Set(); return {add: value => values.add(value), contains: value => values.has(value)};};
    const steps = Array.from({length: 10}, () => ({classList: classes()}));
    const chapterParagraph = {classList: classes()};
    const tallTimeline = {classList: classes()};
    const labParagraph = {classList: classes()};
    const body = {classList: classes()};
    const positions = [-5000, -1000, 0, 500, 1000, 2000, 3000, 5000];
    const drawings = positions.map(top => ({
        classList: classes(),
        parentElement: {getBoundingClientRect() {return {top, height: 230};}},
        style: {setProperty(key, value) {this[key] = value;}}
    }));
    const overview = {classList: classes(), querySelectorAll(selector) {return selector === '.flow-doodle' ? drawings : steps;}};
    overview.classList.add('active');
    const events = {};
    const frames = [];
    const observed = new Set();
    const preference = {matches: reduced};
    let reveal;
    const window = {
        innerHeight: 900,
        matchMedia() {return preference;},
        addEventListener(type, listener, options) {assert.equal(options.passive, true); events[type] = listener;},
        requestAnimationFrame(callback) {frames.push(callback); return frames.length;}
    };
    if (supported) window.IntersectionObserver = class {
        constructor(callback, options) {
            assert.equal(options.threshold, 0, 'A tall chapter must reveal when its first line enters view');
            reveal = callback;
        }
        observe(step) {observed.add(step);}
        unobserve(step) {observed.delete(step);}
    };
    const document = {body, addEventListener() {}, getElementById() {return overview;}, querySelectorAll(selector) {
        assert.ok(!/(^|,)\s*\.flow-step\s*(,|$)/.test(selector), 'Never hide an entire step with its timeline segment');
        assert.ok(!selector.includes('.flow-connector') && !selector.includes('.flow-card-top') && !selector.includes('.flow-number'), 'The timeline spine and numbers must appear before annotations');
        assert.ok(selector.includes('.lab-notebook'), 'The laboratory notebook shares the text reveal');
        return [...steps, ...drawings, chapterParagraph, tallTimeline, labParagraph];
    }};
    vm.runInNewContext(pageSource, {window, document});
    return {overview, body, steps, chapterParagraph, tallTimeline, labParagraph, drawings, events, frames, observed, preference, reveal};
}
for (const options of [{reduced: true}, {supported: false}]) {
    const state = runMotion(options);
    assert.equal(state.body.classList.contains('flow-motion'), false, 'Static fallback must leave every step and chapter readable');
    assert.equal(state.frames.length, 0);
}
const motion = runMotion();
assert.equal(motion.observed.size, motion.steps.length + motion.drawings.length + 3);
assert.equal(motion.body.classList.contains('flow-motion'), true);
for (const chapter of [motion.chapterParagraph, motion.tallTimeline, motion.labParagraph]) {
    assert.ok(motion.observed.has(chapter), 'Detailed chapters must use the same scroll reveal');
    motion.reveal([{target: chapter, isIntersecting: true}]);
    assert.ok(chapter.classList.contains('is-visible'));
}
motion.reveal([{target: motion.steps[0], isIntersecting: false}, {target: motion.steps[1], isIntersecting: true}]);
assert.equal(motion.steps[0].classList.contains('is-visible'), false);
assert.equal(motion.steps[1].classList.contains('is-visible'), true);
assert.equal(motion.observed.has(motion.steps[1]), false, 'Reveal each step once');
motion.events.scroll(); motion.events.scroll();
assert.equal(motion.frames.length, 1, 'Coalesce scroll updates into one animation frame');
motion.frames.shift()();
const shifts = motion.drawings.map(item => parseFloat(item.style['--parallax-y']));
assert.ok(shifts[0] > shifts[2] && shifts[2] > shifts[7]);
assert.ok(shifts.every(value => Math.abs(value) <= 28), 'Parallax must stay subtle');
motion.preference.matches = true;
motion.events.scroll(); motion.frames.shift()();
assert.deepEqual(motion.drawings.map(item => parseFloat(item.style['--parallax-y'])), shifts, 'Stop updating when reduced motion is enabled');
const lab = fs.readFileSync(path.join(root, 'protocols.html'), 'utf8');
assert.ok(lab.includes('class="handwritten-page lab-notebook"'));
assert.equal([...lab.matchAll(/class="expand-menu-header"/g)].length, 30);
assert.equal([...lab.matchAll(/class="expand-menu overview-menu open"/g)].length, 5);
assert.equal([...lab.matchAll(/class="protocol-table"/g)].length, 49, 'Retain every laboratory table');
assert.ok(!lab.includes('<div class="expand-menu-header"'), 'Chapter controls must support native keyboard input');
for (const page of [html, lab]) {
    assert.ok(page.includes('css/handwritten.css'));
    assert.ok(page.includes('js/handwritten.js'));
}
assert.ok(fs.statSync(path.join(root, 'images/paper/parchment.webp')).size < 150000, 'Reuse one small paper texture');
console.log('Timeline-first reveal, 8 drawings, both handwritten pages, preserved lab tables, navigation, parallax and reduced-motion fallback: passed');
