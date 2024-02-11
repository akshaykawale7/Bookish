import "dotenv/config";
import express from "express";
import pg from "pg";
import bodyParser from "body-parser";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import pkg from "passport-google-oauth2";
import session from "express-session";

const app = express();
const port = process.env.PORT || 3000;

const saltRounds = 10;
const GoogleStrategy = pkg.Strategy;

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
  user: process.env.USER,
  host: process.env.HOST,
  database: process.env.DATABASE,
  password: process.env.PASSWORD,
  port: process.env.DB_PORT,
  ssl: {
    // This property enables SSL
    rejectUnauthorized: false, // You may need to set this to 'false' if you encounter certificate validation issues
  },
});
db.connect();

app.get("/", async (req, res) => {
  const sortCriterion = req.query.sort || "default";
  let orderByClause;

  // Determine the ORDER BY clause based on the sorting criterion
  switch (sortCriterion) {
    case "title":
      orderByClause = "ORDER BY title ASC";
      break;
    case "rating":
      orderByClause = "ORDER BY rating DESC";
      break;
    case "recent":
      orderByClause = "ORDER BY added_on DESC";
      break;
    default:
      orderByClause = "ORDER BY added_on DESC"; // Handle default sorting criterion
      break;
  }

  // Execute the database query with the ORDER BY clause
  const result = await db.query(
    `SELECT * FROM books WHERE public = true ${orderByClause}`
  );

  res.render("index.ejs", { books: result.rows, req: req });
});

app.get("/books/:bookId", async (req, res) => {
  const bookId = req.params.bookId;
  const result = await db.query(`SELECT * FROM books where id = ${bookId} `);
  const book = result.rows[0];
  res.render("book.ejs", {
    title: book.title,
    isbn: book.isbn,
    rating: book.rating,
    added_on: book.added_on,
    notes: book.notes,
    bookId: bookId,
    public: book.public,
    userID: book.user_id,
    req: req,
  });
});

app.get("/books", async (req, res) => {
  if (req.isAuthenticated()) {
    const sortCriterion = req.query.sort || "default";
    let orderByClause;

    // Determine the ORDER BY clause based on the sorting criterion
    switch (sortCriterion) {
      case "title":
        orderByClause = "ORDER BY title ASC";
        break;
      case "rating":
        orderByClause = "ORDER BY rating DESC";
        break;
      case "recent":
        orderByClause = "ORDER BY added_on DESC";
        break;
      default:
        orderByClause = "ORDER BY added_on DESC"; // Handle default sorting criterion
        break;
    }

    // Execute the database query with the ORDER BY clause
    const result = await db.query(
      `SELECT * FROM books WHERE user_id = $1 ${orderByClause}`,
      [req.user.id]
    );

    res.render("books.ejs", { books: result.rows, req: req });
  } else {
    res.redirect("/login");
  }
});

app.get("/login", (req, res) => {
  res.render("login.ejs", { req: req });
});

app.get("/register", (req, res) => {
  res.render("register.ejs", { req: req });
});

app.get("/logout", (req, res) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

app.get(
  "/auth/google/books",
  passport.authenticate("google", {
    successRedirect: "/books",
    failureRedirect: "/login",
  })
);

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/books",
    failureRedirect: "/login",
  })
);

app.post("/", async (req, res) => {
  await db.query("UPDATE books SET public = NOT public WHERE id = $1", [
    req.body.bookId,
  ]);

  res.redirect(`/books/${req.body.bookId}`);
});

app.post("/books", async (req, res) => {
  await db.query(
    "INSERT INTO books (title,isbn,rating,notes,user_id,username) VALUES($1,$2,$3,$4,$5,$6)",
    [
      req.body.title,
      req.body.isbn,
      req.body.rating,
      req.body.notes,
      req.body.id,
      req.body.username,
    ]
  );

  res.redirect("/books");
});
app.post("/compose", (req, res) => {
  const isbn = req.body.isbn;

  res.render("compose.ejs", { isbn: isbn, req: req });
});
app.post("/edit", async (req, res) => {
  await db.query(
    "UPDATE books SET title = $1, rating = $2, notes = $3 WHERE isbn = $4 AND id = $5",
    [
      req.body.title,
      req.body.rating,
      req.body.notes,
      req.body.isbn,
      req.body.bookId,
    ]
  );
  res.redirect(`/books/${req.body.bookId}`);
});
app.post("/delete", async (req, res) => {
  await db.query("DELETE FROM books WHERE id = $1", [req.body.bookId]);
  res.redirect("/books");
});

app.post("/register", async (req, res) => {
  const username = req.body.username;
  const email = req.body.email;
  const password = req.body.password;

  try {
    const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (checkResult.rows.length > 0) {
      req.redirect("/login");
    } else {
      bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
          console.error("Error hashing password:", err);
        } else {
          const result = await db.query(
            "INSERT INTO users (email, password,username) VALUES ($1, $2,$3) RETURNING *",
            [email, hash, username]
          );
          const user = result.rows[0];
          req.login(user, (err) => {
            res.redirect("/books");
          });
        }
      });
    }
  } catch (err) {
    console.log(err);
  }
});

passport.use(
  "local",
  new Strategy(async function verify(username, password, cb) {
    try {
      const result = await db.query("SELECT * FROM users WHERE email = $1", [
        username,
      ]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const storedHashedPassword = user.password;
        bcrypt.compare(password, storedHashedPassword, (err, valid) => {
          if (err) {
            //Error with password check
            console.error("Error comparing passwords:", err);
            return cb(err);
          } else {
            if (valid) {
              //Passed password check
              return cb(null, user);
            } else {
              //Did not pass password check
              return cb(null, false);
            }
          }
        });
      } else {
        return cb("User not found");
      }
    } catch (err) {
      console.log(err);
    }
  })
);

passport.use(
  "google",
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.USER_ProfileURL,
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    },
    async (accessToken, refreshToken, profile, cb) => {
      try {
        const result = await db.query("SELECT * FROM users WHERE email = $1", [
          profile.email,
        ]);

        if (result.rows.length === 0) {
          const newUser = await db.query(
            "INSERT INTO users (email,username,password) VALUES($1,$2,$3)",
            [profile.email, profile.displayName, "google"]
          );
          return cb(null, newUser.rows[0]);
        } else {
          //Already exisiting user
          return cb(null, result.rows[0]);
        }
      } catch (err) {
        return cb(err);
      }
    }
  )
);

passport.serializeUser((user, cb) => {
  cb(null, user);
});
passport.deserializeUser((user, cb) => {
  cb(null, user);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
