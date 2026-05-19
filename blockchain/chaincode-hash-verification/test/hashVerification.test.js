'use strict';

const sinon     = require('sinon');
const chai      = require('chai');
const sinonChai = require('sinon-chai');

const { HashVerification } = require('../lib/hashVerification');

const { expect } = chai;
chai.use(sinonChai);


function createMockStub() {
    const state = new Map();

    const stub = {
        getState: sinon.stub().callsFake(async (key) => {
            const val = state.get(key);
            return val ? Buffer.from(val) : Buffer.alloc(0);
        }),

        putState: sinon.stub().callsFake(async (key, value) => {
            state.set(key, value.toString());
        }),

        getTxID: sinon.stub().returns('mock-tx-id-0001'),

        getTxTimestamp: sinon.stub().returns({
            seconds: { low: 1746500000 },
        }),

        getQueryResultWithPagination: sinon.stub().callsFake(
            async (query, pageSize, bookmark) => {
                const selector = JSON.parse(query).selector;

                const records = [];
                for (const [, val] of state) {
                    const r = JSON.parse(val);
                    if (
                        r.docType === selector.docType &&
                        r.fintechId === selector.fintechId
                    ) {
                        records.push(r);
                    }
                }

                const offset     = parseInt(bookmark, 10) || 0;
                const page       = records.slice(offset, offset + pageSize);
                const nextOffset = offset + page.length;
                const hasMore    = nextOffset < records.length;

                let idx = 0;
                const iterator = {
                    next: async () => {
                        if (idx < page.length) {
                            const jsonStr = JSON.stringify(page[idx++]);
                            return {
                                done: false,
                                value: { value: { toString: () => jsonStr } },
                            };
                        }
                        return { done: true, value: undefined };
                    },
                    close: sinon.stub().resolves(),
                };

                return {
                    iterator,
                    metadata: { bookmark: hasMore ? String(nextOffset) : '' },
                };
            }
        ),

        getHistoryForKey: sinon.stub().callsFake(async (key) => {
            const val = state.get(key);
            const entries = val
                ? [{
                    txId:      'hist-tx-001',
                    timestamp: { seconds: { low: 1746500000 } },
                    isDelete:  false,
                    value:     Buffer.from(val),
                }]
                : [];

            let idx = 0;
            return {
                next:  async () => idx < entries.length
                    ? { done: false, value: entries[idx++] }
                    : { done: true,  value: undefined },
                close: sinon.stub().resolves(),
            };
        }),

        _state: state,
    };

    return stub;
}


const VALID_TX_ID   = 'TX-2026-001';
const VALID_HASH    = 'a'.repeat(64);   // 64 chars hex válidos
const TAMPERED_HASH = 'b'.repeat(64);   // hash diferente — simula adulteração
const INVALID_HASH  = 'xyz_not_hex_!!'; // formato inválido
const FINTECH_ID    = 'fintech-mackenzie-001';
const UNKNOWN_TX_ID = 'TX-INEXISTENTE-999';

async function registerTransaction(
    stub,
    txId    = VALID_TX_ID,
    hash    = VALID_HASH,
    fintech = FINTECH_ID
) {
    return new HashVerification().RegisterHash(stub, [txId, hash, fintech]);
}


describe('RegisterHash', () => {
    let stub;
    let contract;

    beforeEach(() => {
        stub     = createMockStub();
        contract = new HashVerification();
    });

    it('deve registrar com sucesso e retornar receipt completo', async () => {
        const result = JSON.parse(
            await contract.RegisterHash(stub, [VALID_TX_ID, VALID_HASH, FINTECH_ID])
        );

        expect(result.status).to.equal('SUCCESS');
        expect(result.transactionId).to.equal(VALID_TX_ID);
        expect(result.verificationId).to.be.a('string').and.have.length.above(0);
        expect(result.timestamp).to.be.a('string');
    });

    it('verificationId deve ser único entre registros distintos', async () => {
        const r1 = JSON.parse(
            await contract.RegisterHash(stub, [VALID_TX_ID, VALID_HASH, FINTECH_ID])
        );
        const stub2 = createMockStub();
        const r2 = JSON.parse(
            await contract.RegisterHash(stub2, ['TX-002', VALID_HASH, FINTECH_ID])
        );

        expect(r1.verificationId).to.be.a('string').and.have.length.above(0);
        expect(r2.verificationId).to.be.a('string').and.have.length.above(0);
    });

    it('deve persistir o HashRecord completo no ledger via putState', async () => {
        await contract.RegisterHash(stub, [VALID_TX_ID, VALID_HASH, FINTECH_ID]);

        expect(stub.putState).to.have.been.calledOnce;

        const stored = JSON.parse(stub._state.get(VALID_TX_ID));
        expect(stored.transactionId).to.equal(VALID_TX_ID);
        expect(stored.hash).to.equal(VALID_HASH);
        expect(stored.fintechId).to.equal(FINTECH_ID);
        expect(stored.verificationId).to.be.a('string');
        expect(stored.timestamp).to.be.a('string');
        expect(stored.docType).to.equal('hashRecord');
    });

    it('deve rejeitar registro duplicado com ALREADY_EXISTS', async () => {
        await contract.RegisterHash(stub, [VALID_TX_ID, VALID_HASH, FINTECH_ID]);

        try {
            await contract.RegisterHash(stub, [VALID_TX_ID, VALID_HASH, FINTECH_ID]);
            throw new Error('deveria ter falhado');
        } catch (err) {
            expect(err.message).to.include('ALREADY_EXISTS');
        }
    });

    it('deve rejeitar hash com formato inválido ', async () => {
        try {
            await contract.RegisterHash(stub, [VALID_TX_ID, INVALID_HASH, FINTECH_ID]);
            throw new Error('deveria ter falhado');
        } catch (err) {
            expect(err.message).to.include('INVALID_HASH');
        }
    });

    it('deve rejeitar chamada com menos de 3 argumentos', async () => {
        try {
            await contract.RegisterHash(stub, [VALID_TX_ID, VALID_HASH]);
            throw new Error('deveria ter falhado');
        } catch (err) {
            expect(err.message).to.include('INVALID_ARGS');
        }
    });
});


describe('QueryHash', () => {
    let stub;
    let contract;

    beforeEach(async () => {
        stub     = createMockStub();
        contract = new HashVerification();
        await registerTransaction(stub);
    });

    it('deve retornar o HashRecord de um ID existente', async () => {
        const record = JSON.parse(
            await contract.QueryHash(stub, [VALID_TX_ID])
        );

        expect(record.transactionId).to.equal(VALID_TX_ID);
        expect(record.hash).to.equal(VALID_HASH);
        expect(record.fintechId).to.equal(FINTECH_ID);
        expect(record.verificationId).to.be.a('string');
        expect(record.timestamp).to.be.a('string');
    });

    it('deve lançar NOT_FOUND para ID inexistente', async () => {
        try {
            await contract.QueryHash(stub, [UNKNOWN_TX_ID]);
            throw new Error('deveria ter falhado');
        } catch (err) {
            expect(err.message).to.include('NOT_FOUND');
        }
    });

    it('deve rejeitar chamada sem argumentos', async () => {
        try {
            await contract.QueryHash(stub, []);
            throw new Error('deveria ter falhado');
        } catch (err) {
            expect(err.message).to.include('INVALID_ARGS');
        }
    });
});


describe('VerifyIntegrity', () => {
    let stub;
    let contract;

    beforeEach(async () => {
        stub     = createMockStub();
        contract = new HashVerification();
        await registerTransaction(stub);
    });

 
    it('hash correto → INTEGRITY_OK, intact = true', async () => {
        const result = JSON.parse(
            await contract.VerifyIntegrity(stub, [VALID_TX_ID, VALID_HASH])
        );

        expect(result.status).to.equal('INTEGRITY_OK');
        expect(result.intact).to.equal(true);
        expect(result.transactionId).to.equal(VALID_TX_ID);
        expect(result.verificationId).to.be.a('string');
        expect(result.registeredAt).to.be.a('string');
        expect(result.verifiedAt).to.be.a('string');
    });


    it('hash adulterado → INTEGRITY_FAILED, intact = false', async () => {
        const result = JSON.parse(
            await contract.VerifyIntegrity(stub, [VALID_TX_ID, TAMPERED_HASH])
        );

        expect(result.status).to.equal('INTEGRITY_FAILED');
        expect(result.intact).to.equal(false);
    });


    it('ID inexistente → lança NOT_FOUND', async () => {
        try {
            await contract.VerifyIntegrity(stub, [UNKNOWN_TX_ID, VALID_HASH]);
            throw new Error('deveria ter falhado');
        } catch (err) {
            expect(err.message).to.include('NOT_FOUND');
            expect(err.message).to.include(UNKNOWN_TX_ID);
        }
    });


    it('fintechId errado → INTEGRITY_OK mas fintechId retornado difere do esperado', async () => {
        const FINTECH_A = 'fintech-A';
        const FINTECH_B = 'fintech-B';

        const stub2 = createMockStub();
        await registerTransaction(stub2, 'TX-FINTECH-A', VALID_HASH, FINTECH_A);

        const result = JSON.parse(
            await contract.VerifyIntegrity(stub2, ['TX-FINTECH-A', VALID_HASH])
        );

        expect(result.status).to.equal('INTEGRITY_OK');
        expect(result.fintechId).to.equal(FINTECH_A);
        expect(result.fintechId).to.not.equal(FINTECH_B);
    });

    it('deve rejeitar chamada com argumentos insuficientes', async () => {
        try {
            await contract.VerifyIntegrity(stub, [VALID_TX_ID]);
            throw new Error('deveria ter falhado');
        } catch (err) {
            expect(err.message).to.include('INVALID_ARGS');
        }
    });
});


describe('GetTransactionsByFintech', () => {
    let stub;
    let contract;

    beforeEach(async () => {
        stub     = createMockStub();
        contract = new HashVerification();

     
        for (let i = 1; i <= 3; i++) {
            await registerTransaction(
                stub,
                `TX-00${i}`,
                String(i).repeat(64),
                FINTECH_ID
            );
        }

        await registerTransaction(stub, 'TX-OUTRA', VALID_HASH, 'outra-fintech');
    });

    it('retornar apenas as transações da fintech solicitada', async () => {
        const result = JSON.parse(
            await contract.GetTransactionsByFintech(stub, [FINTECH_ID])
        );

        expect(result.records).to.have.length(3);
        result.records.forEach(r => {
            expect(r).to.have.all.keys(
                'transactionId', 'verificationId', 'timestamp', 'status'
            );
            expect(r.status).to.equal('REGISTERED');
        });
    });

    it(' deve retornar estrutura de paginação completa', async () => {
        const result = JSON.parse(
            await contract.GetTransactionsByFintech(stub, [FINTECH_ID, '10', ''])
        );

        expect(result).to.have.all.keys(
            'records', 'totalCount', 'bookmark', 'hasMore'
        );
        expect(result.totalCount).to.equal(3);
        expect(result.hasMore).to.equal(false);
    });

    it(' pageSize menor que total retorna hasMore = true e bookmark preenchido', async () => {
        const result = JSON.parse(
            await contract.GetTransactionsByFintech(stub, [FINTECH_ID, '2', ''])
        );

        expect(result.records).to.have.length(2);
        expect(result.hasMore).to.equal(true);
        expect(result.bookmark).to.equal('2');
    });

    it('bookmark permite navegar para a próxima página', async () => {
        const page1 = JSON.parse(
            await contract.GetTransactionsByFintech(stub, [FINTECH_ID, '2', ''])
        );
        const page2 = JSON.parse(
            await contract.GetTransactionsByFintech(stub, [FINTECH_ID, '2', page1.bookmark])
        );

        expect(page2.records).to.have.length(1);
        expect(page2.hasMore).to.equal(false);
    });

    it('deve rejeitar chamada sem fintechId', async () => {
        try {
            await contract.GetTransactionsByFintech(stub, []);
            throw new Error('deveria ter falhado');
        } catch (err) {
            expect(err.message).to.include('INVALID_ARGS');
        }
    });
});
