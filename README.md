# Colord

The color grid uses Lit and is bundled into `static/dist` for FastAPI to serve.
Build the frontend after installing dependencies:

```sh
npm ci
npm run build
```

Run the app with Docker Compose by setting `ADMIN_PASSWORD` in `.env`, then:

```sh
docker compose up --build -d
```

Open `http://localhost:8000`. Color data is stored in the `colord-data` volume.