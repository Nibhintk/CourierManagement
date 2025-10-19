const express = require("express");
require('dotenv').config()
const bodyParser = require("body-parser");
const cors = require("cors");
const db = require("./db");
const path = require("path");
const userRouter = require("./routes/users.js");
const expressLayouts = require("express-ejs-layouts");
const session = require("express-session"); 
const MySQLStore = require("express-mysql-session")(session); // ✅ must come before using

const app = express();
app.use(express.static(path.join(__dirname, "public")));
// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// View engine setup
app.set("view engine", "ejs"); 
app.set("views", path.join(__dirname, "views")); 
app.use(expressLayouts);
app.set("layout", "layout/boilerplate");

// Session store options
const options = {
  host: "localhost",
  port: 3306,
  user: "root",
  password: process.env.DB_PASS, // 🔒 replace with your DB password
  database: "courier_db"
};

// Create store
const sessionStore = new MySQLStore(options);

// Setup session middleware
app.use(
  session({
    key: "session_cookie_name",
    secret:process.env.SECRET_KEY , // change this in production
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 } // 1 hour
  })
);
// Make 'user' available in all EJS templates
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Routes
app.get("/", (req, res) => {
  res.redirect("/home");
});

app.use("/", userRouter);

// Server
app.listen(5000, () => console.log("🚀 Server running on port 5000"));
