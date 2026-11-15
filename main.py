import hmac
import json
import os
import re
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

load_dotenv()

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

origins = [
    "http://localhost",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_FILE = Path(os.getenv("COLORS_FILE", "colors.json"))
templates = Jinja2Templates(directory="templates")
HEX_PATTERN = re.compile(r"^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")


class ColorItem(BaseModel):
    color: str
    name: str | None = None


class AuthRequest(BaseModel):
    password: str


def verify_admin(x_admin_password: str = Header(default="")) -> None:
    if not ADMIN_PASSWORD:
        raise HTTPException(status_code=500, detail="Server password is not configured in .env.")
    if not hmac.compare_digest(x_admin_password, ADMIN_PASSWORD):
        raise HTTPException(status_code=401, detail="Invalid password.")


def load_colors() -> list[dict[str, str | None]]:
    if not DATA_FILE.exists():
        save_colors([])
        return []
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        raw: list[Any] = json.load(f)

    normalized: list[dict[str, str | None]] = []
    for entry in raw:
        if isinstance(entry, str):
            normalized.append({"color": entry, "name": None})
        elif isinstance(entry, dict) and "color" in entry:
            normalized.append({
                "color": entry["color"],
                "name": entry.get("name") or None
            })
    return normalized


def save_colors(colors: list[dict[str, str | None]]) -> None:
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(colors, f, ensure_ascii=False, indent=2)


@app.get("/", response_class=HTMLResponse)
async def main(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"colors": load_colors()}
    )


# Render color registration page
@app.get("/register", response_class=HTMLResponse)
async def register_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="register.html",
        context={"colors": load_colors()}
    )


# Verify admin password
@app.post("/auth")
async def authenticate(payload: AuthRequest):
    if not ADMIN_PASSWORD:
        raise HTTPException(status_code=500, detail="ADMIN_PASSWORD is not set in .env.")
    if not hmac.compare_digest(payload.password, ADMIN_PASSWORD):
        raise HTTPException(status_code=401, detail="Incorrect password.")
    return {"authenticated": True}


# 1. Get color list
@app.get("/colors")
async def get_colors():
    return {"colors": load_colors()}


# 2. Add a HEX color (requires admin password)
@app.post("/colors", dependencies=[Depends(verify_admin)])
async def add_color(item: ColorItem):
    colors = load_colors()
    color = item.color.strip().upper()
    name = item.name.strip() if item.name and item.name.strip() else None

    if not HEX_PATTERN.match(color):
        raise HTTPException(
            status_code=400,
            detail="Invalid HEX color code. Use #RGB or #RRGGBB."
        )
    if any(c["color"] == color for c in colors):
        raise HTTPException(status_code=400, detail="Color already exists.")

    colors.append({"color": color, "name": name})
    save_colors(colors)
    return {"message": "Color added", "colors": colors}


# 3. Delete a HEX color (requires admin password)
@app.delete("/colors/{color}", dependencies=[Depends(verify_admin)])
async def delete_color(color: str):
    colors = load_colors()
    target = color.strip().upper()
    if not target.startswith("#"):
        target = f"#{target}"

    updated = [c for c in colors if c["color"] != target]
    if len(updated) == len(colors):
        raise HTTPException(status_code=404, detail="Color not found.")

    save_colors(updated)
    return {"message": "Color deleted", "colors": updated}