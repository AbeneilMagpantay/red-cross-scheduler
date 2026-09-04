import test from 'node:test';
import assert from 'node:assert/strict';
import { getPageInfo, getWalkthroughSteps, PAGE_INFO } from './appExperience.js';

test('provides an infoboard for every authenticated page', () => {
    const routes = ['/', '/tracker', '/personnel', '/schedule', '/attendance', '/records', '/swaps', '/alerts', '/nexus', '/core', '/settings'];

    routes.forEach((route) => {
        assert.ok(PAGE_INFO[route], `${route} should have page guidance`);
        assert.ok(getPageInfo(route).items.length > 0);
    });
});

test('walkthrough includes Personnel only for administrators', () => {
    const volunteerPaths = getWalkthroughSteps({ isAdmin: false }).map((step) => step.path);
    const adminPaths = getWalkthroughSteps({ isAdmin: true }).map((step) => step.path);

    assert.equal(volunteerPaths.includes('/personnel'), false);
    assert.equal(adminPaths.includes('/personnel'), true);
    assert.ok(volunteerPaths.includes('/nexus'));
    assert.ok(volunteerPaths.includes('/core'));
});
