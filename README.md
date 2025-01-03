# mysimpledb

A lightweight, JSON-based database module for Node.js.

## Features
* Get, set, delete, list keys
* Backup and clear database

## Installation

```bash
npm install mysimpledb
```
## Usage
```js
const Database = require('mysimpledb');

const db = new Database('mydb.json');
await db.set('key', 'value');
console.log(await db.get('key'));
```
