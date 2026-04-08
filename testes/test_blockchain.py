from api.Blockchain import registra_hash

def test_registra_hash():
    assert registra_hash("abc123") is True