from fastapi import APIRouter, HTTPException, Header, Depends
from app.models.transaction import (
    RegisterTransactionRequest,
    RegisterTransactionResponse,
    VerifyTransactionRequest,
    VerifyTransactionResponse,
)
from app.core.fabric_client import invoke_chaincode, query_chaincode
from app.core.config import get_settings

router = APIRouter(prefix="/transactions", tags=["Transactions"])
settings = get_settings()

def verify_api_key(x_api_key: str = Header(...)):
    if x_api_key != settings.API_KEY:
        raise HTTPException(status_code=401, detail="API Key inválida.")
    return x_api_key

# ─── RF01/RF02/RF03: Registrar Transação ─────────────────────────────────────
@router.post("/", response_model=RegisterTransactionResponse, status_code=201)
async def register_transaction(
    request: RegisterTransactionRequest,
    api_key: str = Depends(verify_api_key)
):
    """
    Registra o hash SHA-256 de uma transação na blockchain.
    Nenhum dado sensível é enviado — apenas o hash.
    """
    try:
        tx_hash = request.compute_hash()
        
        result = invoke_chaincode(
            "RegisterHash",
            [request.transaction_id, tx_hash, request.fintech_id]
        )
        
        return RegisterTransactionResponse(
            status=result["status"],
            transaction_id=result["transactionId"],
            verification_id=result["verificationId"],
            hash=tx_hash,
            timestamp=result["timestamp"]
        )
    except Exception as e:
        err = str(e)
        if "ALREADY_EXISTS" in err:
            raise HTTPException(status_code=409, detail=str(e))
        raise HTTPException(status_code=500, detail=str(e))

# ─── RF04/RF05/RF06: Verificar Integridade ───────────────────────────────────
@router.post("/{transaction_id}/verify", response_model=VerifyTransactionResponse)
async def verify_transaction(
    transaction_id: str,
    request: VerifyTransactionRequest,
    api_key: str = Depends(verify_api_key)
):
    """
    Verifica se os dados de uma transação mantêm integridade
    comparando com o hash registrado na blockchain.
    """
    try:
        candidate_hash = request.compute_hash()
        
        result = query_chaincode(
            "VerifyIntegrity",
            [transaction_id, candidate_hash]
        )
        
        return VerifyTransactionResponse(
            transaction_id=result["transactionId"],
            verification_id=result["verificationId"],
            fintech_id=result["fintechId"],
            status=result["status"],
            intact=result["intact"],
            registered_at=result["registeredAt"],
            verified_at=result["verifiedAt"]
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── RF04: Consultar Hash por ID ─────────────────────────────────────────────
@router.get("/{transaction_id}")
async def get_transaction(
    transaction_id: str,
    api_key: str = Depends(verify_api_key)
):
    """Consulta o registro de uma transação na blockchain pelo ID."""
    try:
        result = query_chaincode("QueryHash", [transaction_id])
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── RF07: Histórico por Fintech ─────────────────────────────────────────────
@router.get("/fintech/{fintech_id}/history")
async def get_fintech_history(
    fintech_id: str,
    page_size: int = 10,
    bookmark: str = "",
    api_key: str = Depends(verify_api_key)
):
    """Lista o histórico paginado de transações de uma fintech."""
    try:
        result = query_chaincode(
            "GetTransactionsByFintech",
            [fintech_id, str(page_size), bookmark]
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
