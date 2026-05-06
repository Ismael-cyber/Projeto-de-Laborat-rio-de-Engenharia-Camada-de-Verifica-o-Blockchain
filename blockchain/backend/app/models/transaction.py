from pydantic import BaseModel, Field
import hashlib
import json

class RegisterTransactionRequest(BaseModel):
    transaction_id: str = Field(..., description="ID único da transação na fintech")
    transaction_data: dict = Field(..., description="Dados da transação para gerar o hash")
    fintech_id: str = Field(..., description="Identificador da fintech")

    def compute_hash(self) -> str:
        """Gera SHA-256 dos dados da transação — nunca expõe dados sensíveis."""
        data_str = json.dumps(self.transaction_data, sort_keys=True)
        return hashlib.sha256(data_str.encode()).hexdigest()

class RegisterTransactionResponse(BaseModel):
    status: str
    transaction_id: str
    verification_id: str
    hash: str
    timestamp: str

class VerifyTransactionRequest(BaseModel):
    transaction_id: str
    transaction_data: dict = Field(..., description="Dados originais para recomputar o hash")

class VerifyTransactionResponse(BaseModel):
    transaction_id: str
    verification_id: str
    fintech_id: str
    status: str
    intact: bool
    registered_at: str
    verified_at: str
