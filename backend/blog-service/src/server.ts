import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

// Temporary in-memory "blogs"
let blogs = [
  { id: 1, title: 'My first blog', content: 'Hello World' },
]

app.get('/blogs', (req, res) => {
  return res.json(blogs)
})

app.post('/blogs', (req, res) => {
  const { title, content } = req.body
  const newBlog = { id: Date.now(), title, content }
  blogs.push(newBlog)
  return res.status(201).json(newBlog)
})

const PORT = process.env.PORT ?? 3002
app.listen(PORT, () => {
  console.log(`Blog Service running on port ${PORT}`)
})
