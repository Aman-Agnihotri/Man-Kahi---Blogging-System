import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()
const app = express()

app.use(cors())
app.use(express.json())

// Minimal user route
app.post('/register', (req, res) => {
  // Use a real DB logic here
  const { username, password } = req.body
  // ...validate and insert into DB
  return res.json({ message: 'User registered successfully' })
})

app.post('/login', (req, res) => {
  // ... check credentials, return a token
  return res.json({ token: 'sample-jwt-token' })
})

const PORT = process.env.PORT ?? 3001
app.listen(PORT, () => {
  console.log(`Auth Service running on port ${PORT}`)
})
