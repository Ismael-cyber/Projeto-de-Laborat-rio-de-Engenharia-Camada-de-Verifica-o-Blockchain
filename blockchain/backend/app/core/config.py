from pydantic_settings import BaseSettings
from functools import lru_cache
import os

class Settings(BaseSettings):
    FABRIC_MSP_ID: str
    FABRIC_CHANNEL: str
    FABRIC_CHAINCODE: str
    FABRIC_PEER_ENDPOINT: str
    FABRIC_PEER_HOST_ALIAS: str
    FABRIC_CERT_PATH: str
    FABRIC_KEY_PATH: str
    FABRIC_TLS_CERT_PATH: str
    API_KEY: str

    class Config:
        env_file = ".env"

@lru_cache()
def get_settings():
    return Settings()
