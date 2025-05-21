# mysimpledb

A lightweight, JSON-based database module for Node.js

## Features
* Get, set, delete, list keys
* Get size
* Clear database

## Installation

```bash
npm install mysimpledb
```

## Usage

```javascript
const Database = require('mysimpledb');
const crypto = require('crypto'); // Needed for generating an encryption key

// Basic usage (unencrypted)
const db = new Database('mydb.json');
(async () => {
    await db.set('key', 'value');
    const result = await db.get('key');
    if (result.ok) {
        console.log(result.value); // Output: value
    }

    // Usage with encryption
    // Important: Securely generate, store, and manage this key!
    const encryptionKey = crypto.randomBytes(32).toString('hex'); 
    const secureDb = new Database('my_secure_db.json', { encryptionKey: encryptionKey });

    await secureDb.set('my_secret', 'this will be encrypted');
    const secretResult = await secureDb.get('my_secret');
    if (secretResult.ok) {
        console.log(secretResult.value); // Output: this will be encrypted
    }
})();
```

## Security

`mysimpledb` incorporates several security features to protect your data:

### Path Traversal Prevention
The database constructor sanitizes database filenames to prevent path traversal attacks, ensuring that database files can only be created and accessed within the current working directory or a subdirectory explicitly specified without `../` sequences.

### Data Encryption
You can enable at-rest encryption for your database to protect sensitive information.

*   **Enabling Encryption**: Pass an `encryptionKey` in the `options` object to the constructor.
    ```javascript
    const crypto = require('crypto');
    
    // Generate a secure key (do this once and store it securely)
    const key = crypto.randomBytes(32).toString('hex'); 

    const db = new Database('my_encrypted_database.json', { encryptionKey: key });
    ```
*   **Key Requirements**: The `encryptionKey` must be a 64-character hexadecimal string, representing a 32-byte key. This is a common requirement for AES-256 algorithms.
*   **Encryption Algorithm**: The library uses AES-256-GCM (Galois/Counter Mode) for encryption. This is an authenticated encryption algorithm that provides both confidentiality and data integrity.
*   **Key Management**: Users are solely responsible for securely generating, storing, and managing their encryption keys. **Loss of the encryption key will result in the permanent inability to decrypt the data stored in the database.**

## Performance

`mysimpledb` includes features to enhance performance:

*   **In-Memory Caching**: The library utilizes an in-memory cache for database contents. Once the database file is read, subsequent read operations (get, list, size, getAll) are served directly from the cache, significantly speeding up access. The cache is updated automatically after write operations.
*   **Write Management**: Write operations (set, delete, empty) are managed to ensure data consistency between the in-memory cache and the disk. Writes are queued to prevent race conditions.

The combination of these features ensures that `mysimpledb` is not only easy to use but also provides a good balance of security and performance for typical use cases.
