from pathlib import Path
from app.core.config import get_settings
import subprocess
import json
import os

settings = get_settings()

def _get_private_key_path() -> str:
    """Encontra o arquivo de chave privada no diretório keystore."""
    keystore_path = Path(settings.FABRIC_KEY_PATH)
    keys = list(keystore_path.glob("*_sk"))
    if not keys:
        keys = list(keystore_path.iterdir())
    if not keys:
        raise FileNotFoundError(f"Nenhuma chave privada encontrada em {keystore_path}")
    return str(keys[0])

def invoke_chaincode(function: str, args: list[str]) -> dict:
    """Invoca uma função do chaincode via CLI do peer."""
    args_json = json.dumps({"function": function, "Args": args})
    
    env = _build_peer_env()
    fabric_samples_dir = Path(settings.FABRIC_SAMPLES_DIR)
    test_network_dir = fabric_samples_dir / "test-network"
    
    cmd = [
        "peer", "chaincode", "invoke",
        "-o", settings.FABRIC_ORDERER_ENDPOINT,
        "--ordererTLSHostnameOverride", "orderer.example.com",
        "--tls",
        "--cafile", str(test_network_dir / "organizations/ordererOrganizations/example.com/tlsca/tlsca.example.com-cert.pem"),
        "-C", settings.FABRIC_CHANNEL,
        "-n", settings.FABRIC_CHAINCODE,
        "--peerAddresses", settings.FABRIC_PEER_ENDPOINT,
        "--tlsRootCertFiles", settings.FABRIC_TLS_CERT_PATH,
        "--peerAddresses", settings.FABRIC_PEER2_ENDPOINT,
        "--tlsRootCertFiles", str(test_network_dir / "organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt"),
        "-c", args_json,
        "--waitForEvent"
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True, env={**os.environ, **env})
    
    if result.returncode != 0:
        error_msg = result.stderr
        raise Exception(f"Chaincode invoke failed: {error_msg}")
    
    # Extrai o payload do output
    output = result.stderr  # peer escreve INFO no stderr
    if "result: status:200" in output:
        start = output.find('payload:"') + 9
        end = output.rfind('"')
        payload_str = output[start:end].replace('\\"', '"')
        return json.loads(payload_str)
    
    raise Exception(f"Invoke falhou: {result.stderr}")

def query_chaincode(function: str, args: list[str]) -> dict:
    """Consulta uma função do chaincode via CLI do peer."""
    args_json = json.dumps({"function": function, "Args": args})
    
    env = _build_peer_env()
    
    cmd = [
        "peer", "chaincode", "query",
        "-C", settings.FABRIC_CHANNEL,
        "-n", settings.FABRIC_CHAINCODE,
        "-c", args_json
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True, env={**os.environ, **env})
    
    if result.returncode != 0:
        error_msg = result.stderr
        if "NOT_FOUND" in error_msg:
            raise ValueError(f"NOT_FOUND: {error_msg}")
        raise Exception(f"Chaincode query failed: {error_msg}")
    
    return json.loads(result.stdout.strip())

def _build_peer_env() -> dict:
    """Monta as variáveis de ambiente para o CLI do peer."""
    fabric_samples_dir = Path(settings.FABRIC_SAMPLES_DIR)
    test_network_dir = fabric_samples_dir / "test-network"
    
    return {
        "CORE_PEER_TLS_ENABLED": "true",
        "CORE_PEER_LOCALMSPID": settings.FABRIC_MSP_ID,
        "CORE_PEER_TLS_ROOTCERT_FILE": settings.FABRIC_TLS_CERT_PATH,
        "CORE_PEER_MSPCONFIGPATH": str(test_network_dir / "organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"),
        "CORE_PEER_ADDRESS": settings.FABRIC_PEER_ENDPOINT,
        "FABRIC_CFG_PATH": str(fabric_samples_dir / "config"),
        "PATH": os.environ.get("PATH", ""),
    }
