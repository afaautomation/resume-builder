# Resume Builder — Backend API

A production-ready Node.js/Express REST API powering a full-featured resume builder.

## Features

| Feature | Implementation |
|---|---|
| **50+ ATS Templates** | SQLite-seeded, Handlebars-rendered HTML/CSS |
| **Drag-and-Drop Editor** | `PATCH /api/resumes/:id/order` updates section order |
| **Content Import** | PDF (pdf-parse), DOCX (mammoth), Images (Tesseract OCR) |
| **Expert Writing Tips** | 30+ tips across 9 sections with CAR method guidance |
| **PDF Download** | Puppeteer headless Chrome renders pixel-perfect PDFs |
| **Full Design Control** | CSS variables: colors, fonts, margins, line-height |
| **ATS Optimization** | 10-rule scoring engine, 0–100 score + grade + feedback |
| **Version History** | Auto-save snapshots before each update |

---

## Quick Start

```bash
cd backend

# 1. Install dependencies (Puppeteer downloads Chromium — takes ~2 min)
npm install

# 2. Seed database with templates & writing tips
npm run seed

# 3. Start dev server
npm run dev
```

Server starts at **http://localhost:5000**

---

## Project Structure

```
backend/
├── src/
│   ├── server.js                  ← Express app entry point
│   ├── config/
│   │   ├── database.js            ← SQLite init & schema
│   │   └── logger.js              ← Winston logger
│   ├── middleware/
│   │   ├── upload.js              ← Multer (PDF/DOCX/Image)
│   │   └── errorHandler.js        ← Global error handler
│   ├── routes/
│   │   ├── resumes.js
│   │   ├── templates.js
│   │   ├── import.js
│   │   ├── export.js
│   │   └── tips.js
│   ├── controllers/
│   │   ├── resumeController.js
│   │   ├── templateController.js
│   │   ├── importController.js
│   │   ├── exportController.js
│   │   └── tipsController.js
│   ├── services/
│   │   ├── extractionService.js   ← PDF/DOCX/OCR parsing
│   │   ├── atsService.js          ← ATS scoring engine
│   │   ├── pdfService.js          ← Puppeteer PDF generator
│   │   └── tipsService.js         ← Writing guidance
│   └── scripts/
│       └── seedTemplates.js       ← DB seeder
├── tests/
│   └── api.test.js                ← Integration tests
├── data/                          ← SQLite database (auto-created)
├── uploads/                       ← Uploaded files (auto-created)
├── exports/                       ← Generated PDFs (auto-created)
├── logs/                          ← Log files (auto-created)
├── .env
└── package.json
```

---

## API Reference

### Resumes — `/api/resumes`

| Method | Path | Description |
|---|---|---|
| GET | `/` | List all resumes |
| POST | `/` | Create resume |
| GET | `/:id` | Get resume (with template HTML/CSS) |
| PUT/PATCH | `/:id` | Update resume |
| DELETE | `/:id` | Delete resume |
| POST | `/:id/duplicate` | Clone resume |
| GET | `/:id/ats` | Get ATS score + feedback |
| PATCH | `/:id/design` | Update design tokens |
| PATCH | `/:id/order` | Update section order (drag-and-drop) |
| GET | `/:id/versions` | Version history |
| POST | `/:id/versions/:vId/restore` | Restore version |

**Resume content shape:**
```json
{
  "contact":        { "name","email","phone","location","linkedin","github","website" },
  "summary":        "string",
  "experience":     [{ "title","company","startDate","endDate","description" }],
  "education":      [{ "degree","field","institution","endDate" }],
  "skills":         ["string"],
  "certifications": ["string"],
  "projects":       [{ "title","description" }],
  "languages":      ["string"],
  "awards":         ["string"],
  "customSections": []
}
```

**Design shape:**
```json
{
  "primaryColor":    "#2563EB",
  "secondaryColor":  "#1e293b",
  "fontFamily":      "Inter, sans-serif",
  "fontSize":        11,
  "lineHeight":      1.5,
  "margins":         { "top":20, "right":20, "bottom":20, "left":20 },
  "sectionSpacing":  12,
  "showPhoto":       false
}
```

### Templates — `/api/templates`

| Method | Path | Description |
|---|---|---|
| GET | `/` | List (filters: `?category=modern&layout=single&ats_only=true`) |
| GET | `/categories` | All categories and layouts |
| GET | `/:id` | Full template with HTML/CSS |

### Import — `/api/import` *(auth required)*

| Method | Path | Description |
|---|---|---|
| POST | `/` | Upload file (`multipart/form-data`, field=`file`) |
| GET | `/jobs` | List import jobs |
| GET | `/jobs/:id` | Get job + extracted data |

**Import query params:** `createResume=true` (auto-creates resume), `resumeId=<id>` (merges into existing)

### Export — `/api/export`

| Method | Path | Description |
|---|---|---|
| GET | `/:resumeId/pdf` | Download PDF |
| GET | `/:resumeId/preview` | HTML preview (WYSIWYG) |

### Tips — `/api/tips` *(public)*

| Method | Path | Description |
|---|---|---|
| GET | `/` | All tips grouped by section |
| GET | `/:section` | Tips for a section (e.g. `experience`) |
| GET | `/:section/random` | Single random tip |

Available sections: `summary · experience · education · skills · certifications · projects · languages · awards · contact`

---

## ATS Scoring Rules

| Rule | Max Points |
|---|---|
| Contact completeness | 10 |
| Required sections present | 15 |
| Professional summary quality | 10 |
| Action verbs in experience | 15 |
| Quantified achievements | 15 |
| Skills count (10+) | 10 |
| Education details | 10 |
| ATS-safe template | 5 |
| PDF file format | 5 |
| Resume length check | 5 |
| **Total** | **100** |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | Server port |
| `JWT_SECRET` | — | **Required** — long random string |
| `JWT_REFRESH_SECRET` | — | **Required** — different random string |
| `DB_PATH` | `./data/resume_builder.db` | SQLite database path |
| `UPLOAD_DIR` | `./uploads` | File upload directory |
| `MAX_FILE_SIZE_MB` | `10` | Max upload file size |
| `PDF_OUTPUT_DIR` | `./exports` | PDF temp storage |
| `CLIENT_ORIGIN` | `http://localhost:3000` | CORS origin |

---

## Running Tests

```bash
npm test
```

Tests cover: resume CRUD, ATS scoring, template listing, tips API, health check.
