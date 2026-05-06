from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import transactions

app = FastAPI(
    title="Hash Verification API",
    description="Camada de verificação criptográfica de transações bancárias via Hyperledger Fabric",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(transactions.router)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "hash-verification-api"}
