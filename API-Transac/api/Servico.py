import hashlib

class Transac:
    def __init__(self, banco):
        self.banco = banco

    def processo_transac(self, data: str):
        hash = hashlib.sha256(data.encode()).hexdigest()
        self.banco.save_hash(hash)
        return hash