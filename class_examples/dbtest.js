const sqlite3 = require('sqlite3')
const { open } = require('sqlite')


async function connect() {
    const db = await open({
        filename: 'addresses.sqlite',
        driver: sqlite3.Database
    })
    console.log(db);

    const result = await db.all('SELECT * FROM person');
    console.log(result);

    newname = "idk"
    id = 1

    const outcome = await db.run(`UPDATE person SET first_name = ? WHERE id = ?;`, [newname, id]);
    console.log(outcome);
}

connect();