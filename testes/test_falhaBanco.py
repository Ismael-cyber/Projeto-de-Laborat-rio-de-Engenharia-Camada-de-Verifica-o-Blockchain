from unittest.mock import MagicMock
import pytest
from api.Servico import Transac

def teste_falha_banco():
    mock_banco = MagicMock()
    mock_banco.save_hash.side_effect = Exception("Erro no banco")

    service = Transac(mock_banco)

    with pytest.raises(Exception):
        service.process_transaction("tx1")