import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getWhatsNewStorageKey,
    hasSeenWhatsNew,
    rememberWhatsNewSeen,
    WHATS_NEW_RELEASE
} from './whatsNew.js';

test('stores the announcement as seen for the current release and user', () => {
    const storedValues = new Map();
    const previousWindow = globalThis.window;

    globalThis.window = {
        localStorage: {
            getItem: (key) => storedValues.get(key) ?? null,
            setItem: (key, value) => storedValues.set(key, value)
        }
    };

    try {
        assert.equal(WHATS_NEW_RELEASE, 'v2');
        assert.equal(hasSeenWhatsNew('person-1'), false);
        rememberWhatsNewSeen('person-1');
        assert.equal(hasSeenWhatsNew('person-1'), true);
        assert.equal(hasSeenWhatsNew('person-2'), false);
        assert.equal(getWhatsNewStorageKey('person-1'), `rcy-whats-new:${WHATS_NEW_RELEASE}:person-1`);
    } finally {
        globalThis.window = previousWindow;
    }
});
