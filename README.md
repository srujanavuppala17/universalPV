# universalPV

This project implements a Universal Plant Viewer web app with a Node.js/Express backend and React/Three.js frontend.

- Upload CAD/3D files (.obj, .stl, .dwg placeholder) and convert to glTF.
- Render models with pan/zoom/rotate controls.
- Click objects to retrieve metadata from PostgreSQL.
- Search database and highlight matching components in 3D.
- Add annotations by double clicking the scene.
- JWT based authentication.

## Development

### Backend
```bash
cd backend
npm install
npm start
```

### Frontend
```bash
cd frontend
npm install
npm start
```
