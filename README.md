# Structural Calc v2

A proper web app for producing Danish structural reports (DS/EN 1990 DK NA).

## Architecture

```
structural_calc_v2/
├── backend/
│   ├── main.py          FastAPI server — all API routes
│   ├── db.py            SQLite persistence (shared with the Streamlit app)
│   ├── requirements.txt Python dependencies
│   └── (calc modules)   Copy steel.py, calc_core.py etc. from the deploy app
└── frontend/
    ├── src/
    │   ├── App.jsx                        Routing (/ and /projects/:id)
    │   ├── pages/
    │   │   ├── ProjectsPage.jsx           Project dashboard
    │   │   └── EditorPage.jsx             Document editor (A1–B3)
    │   ├── components/blocks/
    │   │   ├── BlockList.jsx              Left add-panel + block list
    │   │   ├── HeadingBlock.jsx           H1/H2/H3 heading
    │   │   ├── TextBlock.jsx              Free text paragraph
    │   │   ├── PythonBlock.jsx            Python script + output
    │   │   └── SteelBeamBlock.jsx         EN 1993 steel beam check
    │   └── api/client.js                  All fetch() calls in one place
    ├── package.json
    └── vite.config.js    Proxies /api/* → localhost:8000
```

The two halves talk to each other via a REST API (JSON over HTTP).
**All structural calculations stay in Python.** React only handles the UI.

---

## Running in development

### 1. Start the backend (Python)

```bash
cd backend
pip install -r requirements.txt
python main.py
# → API running at http://localhost:8000
# → Interactive docs at http://localhost:8000/docs
```

### 2. Start the frontend (JavaScript)

```bash
cd frontend
npm install
npm run dev
# → App running at http://localhost:5173
```

Open `http://localhost:5173` in your browser.

---

## Copying calc modules from the Streamlit app

The backend relies on the same Python modules already in `structural_calc_deploy/`.
Copy them across when you need them:

```bash
# From the structural_calc_v2/backend/ folder:
cp ../../structural_calc_deploy/steel.py .
cp ../../structural_calc_deploy/calc_core.py .
# ... etc.
```

`db.py` is already copied. The database file (`projects.db`) will be created
automatically on first run — or you can point `DB_PATH` in `db.py` to the
existing deploy database to share data between both apps while migrating.

---

## How it works (plain English)

- The **frontend** is what you see: project cards, document editor, block list.
  It's written in React (JavaScript). When you click "Run check" or "Generate PDF",
  the frontend sends a request to the backend and shows the result — no page reload.

- The **backend** does the work: runs Eurocode checks, saves projects to SQLite,
  generates PDFs. It's written in Python (FastAPI). No UI code, just data in and data out.

- The **Vite proxy** (in `vite.config.js`) forwards every `/api/…` fetch from
  the frontend to `http://localhost:8000`. This means the React code never
  needs to know the backend URL — it just uses `/api/projects` etc.

---

## Block types

| Type          | File                     | Description                               |
|---------------|--------------------------|-------------------------------------------|
| `heading`     | HeadingBlock.jsx         | H1/H2/H3 section title                    |
| `text`        | TextBlock.jsx            | Free text paragraph                       |
| `python_calc` | PythonBlock.jsx          | Python script with numpy/scipy/matplotlib |
| `steel_beam`  | SteelBeamBlock.jsx       | EN 1993-1-1 IPE/HEA/HEB beam check       |

To add a new block type:
1. Create `frontend/src/components/blocks/YourBlock.jsx`
2. Add it to the `BLOCK_TYPES` array in `BlockList.jsx`
3. Add a `/calc/your-type` route in `backend/main.py`

---

## API routes

| Method | Path                              | Description                     |
|--------|-----------------------------------|---------------------------------|
| GET    | /projects                         | List all projects               |
| POST   | /projects                         | Create new project              |
| GET    | /projects/{id}                    | Get one project                 |
| PUT    | /projects/{id}                    | Save / update project           |
| DELETE | /projects/{id}                    | Delete project                  |
| POST   | /projects/{id}/pdf/{doc_id}       | Generate PDF download           |
| POST   | /calc/steel-beam                  | EN 1993 beam check              |
| POST   | /calc/python-script               | Run arbitrary Python code       |

Full interactive docs: `http://localhost:8000/docs` (when backend is running)
