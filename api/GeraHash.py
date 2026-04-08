import hashlib

def gera_hash(data: str) -> str:
    return hashlib.sha256(data.encode()).hexdigest()