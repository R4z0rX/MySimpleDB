const fs = require("fs/promises");
const path = require("path");
const crypto = require('crypto');

class RequestError extends Error {
    constructor(message) {
        super(message);
        this.name = "RequestError";
    }
}

class Database {
    constructor(dbFileName = "database.json", options = {}) {
        const cwd = process.cwd();
        const resolvedPath = path.resolve(cwd, dbFileName);

        if (!resolvedPath.startsWith(cwd)) {
            throw new RequestError("Invalid path: Path traversal attempt detected.");
        }

        const filename = path.basename(resolvedPath);
        if (filename.includes("\0")) {
            throw new RequestError("Invalid filename: Null bytes are not allowed.");
        }

        this.dbPath = resolvedPath;
        this.encryptionKey = options.encryptionKey; // Expected to be a 64-char hex string for a 32-byte key
        
        this.cache = null;
        this.cacheLoaded = false;
        this.writeLock = Promise.resolve();
    }

    // Deep clone utility
    _clone(obj) {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        try {
            return JSON.parse(JSON.stringify(obj));
        } catch (e) {
            // Fallback for objects not serializable by JSON (e.g. containing functions, undefined)
            // For simple JSON-like DB objects, JSON.parse(JSON.stringify) is usually fine.
            // Consider a more robust cloning library if complex objects are stored.
            throw new RequestError("Failed to clone database object.");
        }
    }

    async _encrypt(text) {
        if (!this.encryptionKey) {
            return text;
        }
        try {
            const key = Buffer.from(this.encryptionKey, 'hex');
            if (key.length !== 32) {
                throw new RequestError("Encryption key must be 32 bytes (64 hex characters).");
            }
            const iv = crypto.randomBytes(16); // AES-GCM uses a 12-byte IV, but 16 bytes is also common and acceptable.
                                            // For consistency and simplicity, using 16 as often seen. Node's default for GCM might be 12.
                                            // Let's stick to 16 for this implementation as per typical examples, but be mindful.
                                            // Update: Node's crypto.createCipheriv for 'aes-256-gcm' typically expects a 12-byte IV.
                                            // Let's adjust to 12 bytes for GCM standard.
            const iv_gcm = crypto.randomBytes(12); // Correct IV size for AES-GCM
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv_gcm);
            let encrypted = cipher.update(text, 'utf8', 'base64');
            encrypted += cipher.final('base64');
            const authTag = cipher.getAuthTag(); // AuthTag is 16 bytes
            return `${iv_gcm.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
        } catch (error) {
            if (error instanceof RequestError) throw error;
            throw new RequestError(`Encryption failed: ${error.message}`);
        }
    }

    async _decrypt(encryptedText) {
        if (!this.encryptionKey) {
            return encryptedText;
        }
        try {
            const parts = encryptedText.split(':');
            if (parts.length !== 3) {
                throw new RequestError("Invalid encrypted text format. Expected IV:AuthTag:Data.");
            }
            const iv_gcm = Buffer.from(parts[0], 'base64');
            const authTag = Buffer.from(parts[1], 'base64');
            const encryptedData = parts[2];

            if (iv_gcm.length !== 12) {
                throw new RequestError("Invalid IV length. Expected 12 bytes for AES-GCM, got " + iv_gcm.length);
            }
            if (authTag.length !== 16) {
                throw new RequestError("Invalid authTag length. Expected 16 bytes for AES-GCM, got " + authTag.length);
            }

            const key = Buffer.from(this.encryptionKey, 'hex');
            if (key.length !== 32) {
                throw new RequestError("Decryption key must be 32 bytes (64 hex characters).");
            }

            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv_gcm);
            decipher.setAuthTag(authTag);
            let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (error) {
            if (error instanceof RequestError) throw error;
            throw new RequestError(`Decryption failed. Invalid key or corrupted data: ${error.message}`);
        }
    }
    
    async _loadDb() {
        try {
            const fileExists = await fs.access(this.dbPath).then(() => true).catch(() => false);
            if (!fileExists) {
                this.cache = {};
                this.cacheLoaded = true;
                return this.cache;
            }

            let fileContent = await fs.readFile(this.dbPath, "utf-8");
            
            if (fileContent.trim() === "") {
                this.cache = {};
                this.cacheLoaded = true;
                return this.cache;
            }

            if (this.encryptionKey) {
                fileContent = await this._decrypt(fileContent);
            }
            this.cache = JSON.parse(fileContent);
            this.cacheLoaded = true;
            return this.cache;
        } catch (error) {
            if (error instanceof RequestError) throw error;
            if (error.code === "ENOENT") { // Handled: file not found means new/empty DB
                this.cache = {};
                this.cacheLoaded = true;
                return this.cache;
            }
            // Re-throw RequestErrors (e.g., from _decrypt, or JSON.parse SyntaxError wrapped below)
            if (error instanceof RequestError) {
                throw error;
            }
            // Wrap SyntaxError from JSON.parse
            if (error instanceof SyntaxError) {
                throw new RequestError("Failed to parse database content. Data may be corrupted or not valid JSON.");
            }
            // For other errors (e.g., fs.readFile permissions EACCES), wrap them.
            throw new RequestError(`Failed to load database: ${error.message}`);
        }
    }

    async _getDbInstance() {
        if (!this.cacheLoaded) {
            // If multiple calls happen before _loadDb completes,
            // this ensures _loadDb is only effectively called once.
            // The first call will initiate loading, subsequent calls will await the same writeLock promise
            // (which also implicitly sequences reads after any pending writes).
            // A more sophisticated read lock might be needed if reads during writes are frequent.
            // For now, using writeLock to also serialize initial load if it hasn't happened.
             this.writeLock = this.writeLock.then(async () => {
                if (!this.cacheLoaded) { // double check after acquiring lock
                    await this._loadDb();
                }
             }).catch(err => {
                // This error will propagate to those awaiting the lock.
                // Reset cacheLoaded so subsequent calls might retry loading.
                this.cacheLoaded = false; 
                throw err;
             });
             await this.writeLock;
        }
        return this._clone(this.cache);
    }

    async _writeDb(data) {
        // Update cache first (with a deep clone)
        this.cache = this._clone(data);
        this.cacheLoaded = true;

        const operation = async () => {
            let dataToWrite = JSON.stringify(data, null, 2);
            if (this.encryptionKey) {
                dataToWrite = await this._encrypt(dataToWrite);
            }
            await fs.writeFile(this.dbPath, dataToWrite, "utf-8");
        };

        this.writeLock = this.writeLock.then(operation).catch(err => {
            // If write fails, the cache is now inconsistent with disk.
            // For simplicity, we don't revert cache here. A more robust system might.
            // The error will propagate to the caller of set/delete/empty.
            if (err instanceof RequestError) throw err;
            throw new RequestError(`Failed to write to database: ${err.message}`);
        });
        await this.writeLock;
    }

    async get(key) {
        const db = await this._getDbInstance();
        if (key in db) {
            return { ok: true, value: db[key] }; // Value is from a clone, safe to return.
        }
        return { ok: false, error: new RequestError("Key not found.") };
    }

    async set(key, value) {
        let errorToThrow = null;
        this.writeLock = this.writeLock.then(async () => {
            const db = await this._getDbInstance(); // Get current state (might load or use cache)
            db[key] = value;
            await this._writeDb(db); // Update cache and write to disk
        }).catch(err => {
            errorToThrow = err; // Capture error to rethrow after lock promise chain
        });
        await this.writeLock;
        if (errorToThrow) throw errorToThrow;
    }

    async delete(key) {
        let result = { ok: false, error: new RequestError("Key not found.") };
        let errorToThrow = null;
        this.writeLock = this.writeLock.then(async () => {
            const db = await this._getDbInstance();
            if (key in db) {
                delete db[key];
                await this._writeDb(db);
                result = { ok: true };
            }
        }).catch(err => {
            errorToThrow = err;
        });
        await this.writeLock;
        if (errorToThrow) throw errorToThrow;
        return result;
    }

    async list() {
        try {
            const db = await this._getDbInstance();
            return { ok: true, value: Object.keys(db) };
        } catch (error) {
            return { ok: false, error: error instanceof RequestError ? error : new RequestError(error.message) };
        }
    }

    async size() {
        // This could throw if _getDbInstance fails, caller should handle it.
        const db = await this._getDbInstance();
        return Object.keys(db).length;
    }    

    async empty() {
        let errorToThrow = null;
        this.writeLock = this.writeLock.then(async () => {
            await this._writeDb({}); // Updates cache to {} and writes to disk
        }).catch(err => {
            errorToThrow = err;
        });
        await this.writeLock;
        if (errorToThrow) throw errorToThrow;
        return this;
    }

    async getAll() {
        // This could throw if _getDbInstance fails, caller should handle it.
        const db = await this._getDbInstance();
        return db; // Returns a clone
    }
}

module.exports = Database;
