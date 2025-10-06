const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

PORT=8080;

let db;
(async () => {
    db = await open({
        filename: 'addresses.sqlite',
        driver: sqlite3.Database
    });

})();





app = express();
app.use(express.static(path.join(__dirname, 'static')));
app.use(express.urlencoded({extended: false}));
app.use(express.json());
app.set('view engine', 'ejs');


app.get('/everyone', async (req, res) => {

    //select to get the data
    console.log("handling, db is:");
    console.log(db);

    const people = await db.all('SELECT * FROM person');
    console.log(people)

    const numbers = await db.all('SELECT * FROM phone_number');
    console.log(numbers);

    //split the numbers up into the correct person objects
    for (let person of people){
        person.numbers = [];
        for (let number of numbers){
            if(number.person_id === person.id){
                person.numbers.push(number)
            }
        }
    }
    console.log(people);

    res.render('addresses', {
        people: people
    });

});



app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
console.log("listening, db is:");
console.log(db);