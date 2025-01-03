const Database = require("../lib/mysimpledb");

(async () => {
    const db = new Database("testdb.json");

    // Get the database size
    let size = await db.size();
    console.log("Database size:", size);    

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
    size = await db.size();
    console.log("Database size:", size);

    // Delete a key
    const deleteResult = await db.delete("age");
    console.log("Delete 'age':", deleteResult);

    // Attempt to delete a non-existent key
    const deleteNonExistent = await db.delete("nonExistentKey");
    console.log("Delete 'nonExistentKey':", deleteNonExistent);
    
    // Get the database size
    size = await db.size();
    console.log("Database size:", size);

    // Get all records
    const allRecords = await db.getAll();
    console.log("All records:", allRecords);

    // Clear the database
    await db.empty();
    console.log("Database cleared.");
    
    // Get the database size
    size = await db.size();
    console.log("Database size:", size);

    // Verify the database is empty
    const emptyRecords = await db.getAll();
    console.log("All records after clearing:", emptyRecords);
})();
