# Resume Builder
A full-stack Resume Builder built with Node.js, Express, and Vanilla JS.

The API is served at `https://api.kompetenzen.in/api`; point that DNS record at
whichever host runs this backend (the `Dockerfile` here builds it on port 5000).

For local development, start the backend from `Resume/backend` with `npm run dev`
and keep it running while using Live Server on port 5500. Live Server serves the
page, but AI writing and cloud saves also require the backend on port 5000.
Check `http://localhost:5000/health` to confirm that the database is connected.
The backend reads its existing `.env` configuration; never put AI or service-role
keys in frontend files.
