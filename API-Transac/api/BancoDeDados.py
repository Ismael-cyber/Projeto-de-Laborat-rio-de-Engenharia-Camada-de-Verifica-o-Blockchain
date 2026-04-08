class BancoDeDados:
    def __init__(self):
        self.data = []

    def save_hash(self, hash_value):
        self.data.append(hash_value)