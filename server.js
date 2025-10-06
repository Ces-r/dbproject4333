const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const PORT = 8080;
const static_dir = path.join(__dirname, 'static');
const app = express();


const bcrypt = require('bcryptjs');
const session = require('express-session');
app.use(session({secret: 'superSecret', resave: false, saveUninitialized: false}));



app.use(express.static(static_dir));
app.use(express.urlencoded({extended: false}));
app.set('view engine', 'ejs');



// New import stuff from the other file
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

// Start the database
let db;
(async () => {
    db = await open({
        filename: 'shopping.sqlite',
        driver: sqlite3.Database
    });

})();

app.get('/', async (req, res) => {
    res.render("home")
});

app.get('/providerReg', async (req, res)=> {
    res.render("registerprovider")
});

app.get('/userRegister', async (req, res)=> {
    res.render("registercustomer")
});


app.post('/providerReg', async (req, res)=>{
    let name = req.body.username;
    let password = req.body.password;
    console.log(name);
    console.log(password);
    const hashpass = await bcrypt.hash(password, 10);

    await db.run(`INSERT INTO USERS (username, password, role) VALUES (?, ?, ?)`, 
        [name, hashpass, "P"]
    ); 
    res.redirect('/');

});

app.post('/regUser', async (req, res) =>{
    let name = req.body.username;
    let password = req.body.password;
    console.log(name);
    console.log(password);
    const hashpass = await bcrypt.hash(password, 10);

    await db.run(`INSERT INTO USERS (username, password, role) VALUES (?, ?, ?)`, 
        [name, hashpass, "C"]
    ); 
    res.redirect('/');
})


app.get("/login", async (req, res)=>{
    res.render("login");
})

app.post("/login", async (req, res) => {
  let errors = []
  let username = req.body.username;
  let password = req.body.password;
  // console.log("Username:", username, "Password:", password);

  // get the data from the databse
  const data = await db.get(`SELECT * FROM users WHERE username = ?`, [username])
  // console.log(data);

  if(!data){
    console.log("data not found in the database")
    errors.push("User data could not be found. Try making an account.")
    return res.render("home", {errors: errors})
  }
    // compare the encrypted password with the other password
    const compare = await bcrypt.compare(password, data.password)
  
    // if the comparison is true, send them to the dashboard
    if(compare){
      console.log("login worked")
      req.session.user = data;
      res.redirect("/dashboard")
    } 
    
    else {
      errors.push("Incorrect password. Try again.")
      return res.render("login", {errors: errors})
    }
  
});

app.get("/dashboard", async (req, res)=>{
    if(!req.session.user){
        return res.redirect("/");
    } else {
        const user = req.session.user;
        const role = req.session.role;
        console.log(user);
        res.render("dashboard", {user: user, role: role})
    }
})

app.listen(PORT, () => console.log(`Server is ready on port ${PORT}`));