import express from 'express';
import 'dotenv/config';
import pg from 'pg';
import extractRouter from "./src/routes/extract.js";

const {Pool} = pg;
const app = express();
app.use(express.json());
app.use(extractRouter);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function setupDatabase(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title TEXT,
    done BOOLEAN)
  `);

  const countRow = await pool.query(`SELECT COUNT(*) FROM tasks`);
  if (Number(countRow.rows[0].count) === 0){
    await pool.query('INSERT INTO tasks (title, done) VALUES ($1, $2)', ['Buy milk', false]);
    await pool.query('INSERT INTO tasks (title, done) VALUES ($1, $2)', ['Walk the dog', true]);
    await pool.query('INSERT INTO tasks (title, done) VALUES ($1, $2)', ['Finish assignment', false]);
  }
}

setupDatabase();


import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'fs';

const openapiDocument = JSON.parse(readFileSync('./docs/openapi.json', 'utf-8'));

app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDocument));
const port = 3000;

app.get('/', (req, res) => {
  res.json({ "name": "Task API", 
    "version": "1.0", 
    "endpoints": ["/tasks"] });
});

app.get('/health', (req, res) => {
  res.json({ "status": "OK" });
});

app.get('/tasks', async (req, res) => {
  const search = req.query.search;
  const done = req.query.done;

  if (search !== undefined) {
    const results = await pool.query('SELECT * FROM tasks WHERE title LIKE $1', [`%${search}%`]);
    return res.json(results.rows);
  }

  if (done === "false"){
    let not_dont_tasks = await pool.query('SELECT * FROM tasks WHERE done = false')
    return res.json(not_dont_tasks.rows)
  }
  const query = await pool.query('SELECT * FROM tasks');
  res.json(query.rows);
});

app.get('/tasks/:id', async (req, res) =>{
  const id = Number(req.params.id);
  const result = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
  const task = result.rows[0];

  console.log(result)

  if (!task){
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  res.json(task);
});

app.post('/tasks', async (req, res) => {
  const title = req.body.title

  if (!title){
    return res.status(400).json({error: "Missing Title"});
  }

  const query = await pool.query("INSERT INTO tasks (title, done) VALUES ($1, $2) RETURNING *", [title, false])

  res.status(201).json(query.rows[0]);
});

app.put('/tasks/:id', async (req, res) => {
  const id = Number(req.params.id);
  let title = req.body.title;
  let done = req.body.done;
  const query = await pool.query('SELECT * FROM tasks WHERE id = $1', [id])
  const task = query.rows[0]

  if (!task){
    return res.status(404).json({error: "Unknown id"});
  }

  if (title === undefined && done === undefined){
    return res.status(400).json({error: "Empty/Invalid body"})
  }

  if (title === undefined){
    title = task.title
  }
  if (done === undefined){
    done = task.done
  }
  const results = await pool.query("UPDATE tasks SET title = $1, done = $2 WHERE id = $3 RETURNING *", [title, done, id])

  res.json(results.rows[0]);
});

app.delete('/tasks/:id', async (req, res) => {
  const id = Number(req.params.id);
  const query = await pool.query('SELECT * FROM tasks WHERE id = $1', [id])
  const task = query.rows[0]
  if (!task) {
    return res.status(404).json({ error: `Task ${id} not found` })
  }

  await pool.query('DELETE FROM tasks WHERE id = $1', [id])

  res.sendStatus(204);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});