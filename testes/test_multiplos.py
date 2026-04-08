import pytest
from api.Servico import Transac
from api.BancoDeDados import BancoDeDados

@pytest.mark.parametrize("input_data", [
    "tx1",
    "tx2",
    "tx3",
])
def test_multiple_transactions(input_data):
    banco = BancoDeDados()
    servic = Transac(banco)

    result = servic.processo_transac(input_data)

    assert result in banco.data