const Database = require("../lib/mysimpledb");
const fs = require("fs/promises");
const path = require("path");

(async () => {
    const dbFileName = "testdb2.json";
    const db = new Database(dbFileName);

    // Set some key-value pairs
    await db.set("name", "Alice");
    await db.set("age", 30);
    await db.set("city", "Wonderland");

    // Get a value for a key
    const name = await db.get("name");
    console.log("Get 'name':", name);

    // Attempt to get a non-existent key
    const nonExistent = await db.get("nonExistentKey");
    console.log("Get 'nonExistentKey':", nonExistent);

    // List all keys
    const keys = await db.list();
    console.log("List of keys:", keys);
    
    // Get the database size
    const size = await db.size();
    console.log("Database size:", size);
    
    // Delete a key
    const deleteResult = await db.delete("age");
    console.log("Delete 'age':", deleteResult);

    // Attempt to delete a non-existent key
    const deleteNonExistent = await db.delete("nonExistentKey");
    console.log("Delete 'nonExistentKey':", deleteNonExistent);

    // Get all records
    const allRecords = await db.getAll();
    console.log("All records:", allRecords);

    // Make a backup of the database file before clearing
    const backupFileName = path.basename(dbFileName, path.extname(dbFileName)) + "_backup.json";
    await fs.copyFile(dbFileName, backupFileName);
    console.log(`Database backed up as: ${backupFileName}`);

    // Clear the database
    await db.empty();
    console.log("Database cleared.");

    // Verify the database is empty
    const emptyRecords = await db.getAll();
    console.log("All records after clearing:", emptyRecords);
})();
