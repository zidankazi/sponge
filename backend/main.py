from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import session, prompt, submit, leaderboard

app = FastAPI(title="Sponge API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://sponge-alpha.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(session.router)
app.include_router(prompt.router)
app.include_router(submit.router)
app.include_router(leaderboard.router)


@app.get("/")
def health():
    return {"status": "ok", "service": "sponge"}
