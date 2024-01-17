import "dotenv/config";
import express from "express";
import pg from "pg";
import bodyParser from "body-parser";

const app = express();
const port = process.env.PORT || 3000;
const db = new pg.Client({
  user: process.env.USER,
  host: process.env.HOST,
  database: process.env.DATABASE,
  password: process.env.PASSWORD,
  port: process.env.DB_PORT,
});
db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.get("/", async (req, res) => {
  const sortCriterion = req.query.sort || "default"; // 'default' or any default sorting criterion
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
  const result = await db.query(`SELECT * FROM books ${orderByClause}`);

  res.render("index.ejs", { books: result.rows });
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
  });
});

app.post("/", async (req, res) => {
  await db.query(
    "INSERT INTO books (title,isbn,rating,notes) VALUES($1,$2,$3,$4)",
    [req.body.title, req.body.isbn, req.body.rating, req.body.notes]
  );

  res.redirect("/");
});
app.post("/compose", (req, res) => {
  const isbn = req.body.isbn;
  res.render("compose.ejs", { isbn: isbn });
});
app.post("/edit", async (req, res) => {
  await db.query(
    "UPDATE books SET title = $1, rating = $2, notes = $3 WHERE isbn = $4",
    [req.body.title, req.body.rating, req.body.notes, req.body.isbn]
  );
  res.redirect(`/books/${req.body.bookId}`);
});
app.post("/delete", async (req, res) => {
  await db.query("DELETE FROM books WHERE isbn = $1", [req.body.isbn]);
  res.redirect("/");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
