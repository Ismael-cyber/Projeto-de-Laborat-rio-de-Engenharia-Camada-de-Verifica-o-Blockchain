from api.Servico import Transac
from api.BancoDeDados import BancoDeDados

def teste_processo_transac():
    banco = BancoDeDados()
    servic = Transac(banco)

    hash = servic.processo_transac("tx1")

    assert hash in banco.data