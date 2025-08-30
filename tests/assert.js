export function assertEquals(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`Assertion failed: ${message || ''}. Expected "${expected}" but got "${actual}"`);
    }
}

export function assertTrue(actual, message) {
    if (actual !== true) {
        throw new Error(`Assertion failed: ${message || ''}. Expected true but got "${actual}"`);
    }
}

export function assertFalse(actual, message) {
    if (actual !== false) {
        throw new Error(`Assertion failed: ${message || ''}. Expected false but got "${actual}"`);
    }
}

export function assertDeepEquals(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Assertion failed: ${message || ''}. Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
    }
}

export function test(name, fn) {
    try {
        fn();
        console.log(`✅ Test passed: ${name}`);
    } catch (e) {
        console.error(`❌ Test failed: ${name}`);
        console.error(e);
    }
}
