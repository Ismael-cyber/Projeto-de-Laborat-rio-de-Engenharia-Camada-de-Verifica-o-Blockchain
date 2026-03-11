

<img width="470" height="246" alt="Diagrama Blockchain" src="https://github.com/user-attachments/assets/35215233-6205-4e89-95fb-2b5b3223ff4c" />

@startuml
left to right direction
actor :Sistema Bancario:
actor Cliente
actor Admin
rectangle Plataforma_Blockhain {
    :Sistema Bancario: --> (Registrar Hash)
    :Sistema Bancario: --> (Consultar Prova)
    (Consultar Prova) <-- Cliente
    Admin --> (Gerenciar Sistema)
@enduml
