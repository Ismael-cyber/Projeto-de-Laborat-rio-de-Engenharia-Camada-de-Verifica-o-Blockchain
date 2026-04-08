from api.GeraHash import gera_hash

def test_gera_hash():
    result = gera_hash("abc")
    assert result == gera_hash("abc") 