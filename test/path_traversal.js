const Database = require('../lib/mysimpledb');
const fs = require('fs/promises');
const path = require('path');

const dbFilesToClean = [];

(async () => {
    let testsPassed = 0;
    let testsFailed = 0;

    const runTest = async (name, testFn) => {
        try {
            await testFn();
            console.log(`PASS: ${name}`);
            testsPassed++;
        } catch (e) {
            console.error(`FAIL: ${name} - ${e.message}`);
            testsFailed++;
        }
    };

    await runTest('Path Traversal Attempt', async () => {
        try {
            new Database('../../traversal_attempt.json');
            throw new Error('Path traversal error was not thrown.');
        } catch (e) {
            if (e.name !== 'RequestError') {
                throw new Error(`Expected RequestError, got ${e.name}`);
            }
            if (!e.message.includes('Path traversal attempt detected')) {
                throw new Error(`Unexpected error message: ${e.message}`);
            }
        }
    });

    await runTest('Null Byte in Filename Attempt', async () => {
        try {
            new Database('test_null\0byte.json');
            throw new Error('Null byte error was not thrown.');
        } catch (e) {
            if (e.name !== 'RequestError') {
                throw new Error(`Expected RequestError, got ${e.name}`);
            }
            if (!e.message.includes('Null bytes are not allowed')) {
                throw new Error(`Unexpected error message: ${e.message}`);
            }
        }
    });

    await runTest('Valid Filename and Basic Operation', async () => {
        const dbFileName = 'path_test_valid.json';
        dbFilesToClean.push(dbFileName);
        const db = new Database(dbFileName);
        await db.set('a', 1);
        const result = await db.get('a');
        if (!result.ok || result.value !== 1) {
            throw new Error(`Set/Get failed. Got: ${JSON.stringify(result)}`);
        }
    });

    console.log(`\nPath Traversal Tests Summary:`);
    console.log(`Passed: ${testsPassed}, Failed: ${testsFailed}`);

    // Cleanup
    for (const file of dbFilesToClean) {
        try {
            await fs.unlink(path.resolve(file));
            console.log(`Cleaned up ${file}`);
        } catch (e) {
            // console.error(`Error cleaning up ${file}: ${e.message}`);
            // Ignore if file was not created due to test failure
        }
    }

    if (testsFailed > 0) {
        // Exit with error code to fail CI/build if any test failed
        process.exit(1);
    }
})();
