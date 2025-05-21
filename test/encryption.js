const Database = require('../lib/mysimpledb');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const dbFilesToClean = [];

(async () => {
    let testsPassed = 0;
    let testsFailed = 0;

    const encryptionKey = crypto.randomBytes(32).toString('hex');
    const wrongKey = crypto.randomBytes(32).toString('hex');

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

    // Test Case 1: Encrypted Write and Decrypted Read
    await runTest('Encrypted Write and Decrypted Read', async () => {
        const dbFileName = 'test_encrypted.json';
        dbFilesToClean.push(dbFileName);
        const db = new Database(dbFileName, { encryptionKey });
        await db.set('secret', 'mysecretdata');
        const result = await db.get('secret');

        if (!result.ok || result.value !== 'mysecretdata') {
            throw new Error(`Set/Get failed. Expected {ok: true, value: 'mysecretdata'}, got ${JSON.stringify(result)}`);
        }

        const rawContent = await fs.readFile(path.resolve(dbFileName), 'utf-8');
        if (rawContent.includes('mysecretdata') || rawContent.includes('secret')) {
            // A very basic check. A more robust check might try to parse it as JSON, which should fail,
            // or check if it's too short to be the plain JSON.
            // For AES-GCM, the output is IV:AuthTag:Ciphertext, all base64 encoded.
            // So "mysecretdata" should not be directly visible.
            throw new Error('Raw file content appears unencrypted or contains plaintext.');
        }
        if (rawContent.startsWith('{')) { // Encrypted content should not be plain JSON
             throw new Error('Raw file content looks like unencrypted JSON.');
        }
    });

    // Test Case 2: Decryption with Wrong Key
    const dbForWrongKeyTest = 'test_wrong_key.json'; // Used by TC2 and TC3
    dbFilesToClean.push(dbForWrongKeyTest);

    await runTest('Decryption with Wrong Key', async () => {
        const dbEnc = new Database(dbForWrongKeyTest, { encryptionKey });
        await dbEnc.set('a', 'b'); // Create and encrypt the file

        const dbDecFail = new Database(dbForWrongKeyTest, { encryptionKey: wrongKey });
        try {
            await dbDecFail.get('a');
            throw new Error('Decryption with wrong key succeeded, but it should have failed.');
        } catch (e) {
            if (e.name !== 'RequestError') {
                throw new Error(`Expected RequestError, got ${e.name} (${e.message})`);
            }
            if (!e.message.toLowerCase().includes('decryption failed') && !e.message.toLowerCase().includes('corrupted data')) {
                throw new Error(`Unexpected error message for wrong key: ${e.message}`);
            }
        }
    });

    // Test Case 3: Attempt to Read Encrypted DB without Key
    await runTest('Attempt to Read Encrypted DB without Key', async () => {
        // Uses 'test_wrong_key.json' created in TC2
        const dbNoKey = new Database(dbForWrongKeyTest); // No encryption key provided
        try {
            await dbNoKey.get('a');
            throw new Error('Reading encrypted DB without key succeeded, but it should have failed.');
        } catch (e) {
            if (e.name !== 'RequestError') {
                throw new Error(`Expected RequestError, got ${e.name} (${e.message})`);
            }
            // This might be a JSON parse error because the content is gibberish without decryption,
            // or a specific "decryption failed" if the code tries to guess.
            // Current implementation will try to JSON.parse the encrypted string.
            if (!e.message.toLowerCase().includes('parse database content') && !e.message.toLowerCase().includes('json')) {
                 throw new Error(`Unexpected error message for no key: ${e.message}`);
            }
        }
    });
    
    // Test Case 4: Attempt to Read Unencrypted DB with Key
    await runTest('Attempt to Read Unencrypted DB with Key', async () => {
        const unencryptedDbFile = 'unencrypted_db.json';
        dbFilesToClean.push(unencryptedDbFile);
        await fs.writeFile(path.resolve(unencryptedDbFile), JSON.stringify({ k: 'v' }));

        const dbUnenc = new Database(unencryptedDbFile, { encryptionKey });
        try {
            await dbUnenc.get('k');
            throw new Error('Reading unencrypted DB with key succeeded, but it should have failed.');
        } catch (e) {
            if (e.name !== 'RequestError') {
                throw new Error(`Expected RequestError, got ${e.name} (${e.message})`);
            }
            // Decryption should fail because the data is not in the IV:AuthTag:Data format
            if (!e.message.toLowerCase().includes('decryption failed') && !e.message.toLowerCase().includes('invalid encrypted text format')) {
                throw new Error(`Unexpected error message for reading unencrypted with key: ${e.message}`);
            }
        }
    });


    console.log(`\nEncryption Tests Summary:`);
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
        process.exit(1);
    }
})();
