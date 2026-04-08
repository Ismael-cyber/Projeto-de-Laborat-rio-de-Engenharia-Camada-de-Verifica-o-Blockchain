class BancoDeDados:
    def __init__(self):
        self.data = []

    def save_hash(self, hash):
        self.data.append(hash)
