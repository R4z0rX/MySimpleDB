const fs = require("fs/promises");
const path = require("path");

class RequestError extends Error {
    constructor(message) {
        super(message);
        this.name = "RequestError";
    }
}

class Database {
    constructor(dbFileName = "database.json") {
        this.dbPath = path.resolve(dbFileName);
    }

    async _readDb() {
        try {
            const data = await fs.readFile(this.dbPath, "utf-8");
            return JSON.parse(data);
        } catch (error) {
            if (error.code === "ENOENT") {
                return {}; // Return empty database if file doesn't exist
            }
            throw new RequestError("Failed to read database.");
        }
    }

    async _writeDb(data) {
        try {
            await fs.writeFile(this.dbPath, JSON.stringify(data, null, 2), "utf-8");
        } catch {
            throw new RequestError("Failed to write to database.");
        }
    }

    async get(key) {
        const db = await this._readDb();
        if (key in db) {
            return { ok: true, value: db[key] };
        }
        return { ok: false, error: new RequestError("Key not found.") };
    }

    async set(key, value) {
        const db = await this._readDb();
        db[key] = value;
        await this._writeDb(db);
    }

    async delete(key) {
        const db = await this._readDb();
        if (key in db) {
            delete db[key];
            await this._writeDb(db);
            return { ok: true };
        }
        return { ok: false, error: new RequestError("Key not found.") };
    }

    async list() {
        try {
            const db = await this._readDb();
            return { ok: true, value: Object.keys(db) };
        } catch (error) {
            return { ok: false, error };
        }
    }

    async size() {
        const db = await this._readDb();
        return Object.keys(db).length;
    }    

    async empty() {
        await this._writeDb({});
        return this;
    }

    async getAll() {
        try {
            const db = await this._readDb();
            return db;
        } catch (error) {
            throw new RequestError("Failed to retrieve all records.");
        }
    }
}

module.exports = Database;
