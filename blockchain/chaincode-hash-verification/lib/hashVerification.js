'use strict';

const shim = require('fabric-shim');
const { v4: uuidv4 } = require('uuid');


function validateSha256(hash) {
    const SHA256_REGEX = /^[a-fA-F0-9]{64}$/;
    if (!SHA256_REGEX.test(hash)) {
        throw new Error('INVALID_HASH: O hash deve ser SHA-256 válido (64 caracteres hexadecimais).');
    }
}


async function getHashRecord(stub, transactionId) {
    const recordBytes = await stub.getState(transactionId);
    if (!recordBytes || recordBytes.length === 0) {
        throw new Error(`NOT_FOUND: Transação '${transactionId}' não encontrada.`);
    }
    return JSON.parse(recordBytes.toString());
}


function toISOTimestamp(fabricTimestamp) {
    const seconds =
        typeof fabricTimestamp.seconds === 'object'
            ? fabricTimestamp.seconds.low   // Long (fabric-shim < 3)
            : fabricTimestamp.seconds;      // number nativo
    return new Date(seconds * 1000).toISOString();
}


class HashVerification {

    async Init(stub) {
        console.log('Chaincode HashVerification inicializado.');
        return shim.success(Buffer.from('Ledger inicializado'));
    }

    async Invoke(stub) {
        const { fcn, params } = stub.getFunctionAndParameters();
        console.log(`Invocando: ${fcn}`, params);

        const methods = {
            RegisterHash:             () => this.RegisterHash(stub, params),
            VerifyIntegrity:          () => this.VerifyIntegrity(stub, params),
            QueryHash:                () => this.QueryHash(stub, params),
            GetTransactionsByFintech: () => this.GetTransactionsByFintech(stub, params),
            GetTransactionHistory:    () => this.GetTransactionHistory(stub, params),
            InitLedger:               () => this.InitLedger(stub),
        };

        if (!methods[fcn]) {
            return shim.error(Buffer.from(`Função '${fcn}' não encontrada.`));
        }

        try {
            const result = await methods[fcn]();
            return shim.success(Buffer.from(result));
        } catch (err) {
            console.error(`Erro em ${fcn}:`, err.message);
            return shim.error(Buffer.from(err.message));
        }
    }

    async InitLedger(stub) {
        return JSON.stringify({ status: 'OK', message: 'Ledger inicializado' });
    }

    
    async RegisterHash(stub, params) {
        if (params.length < 3) {
            throw new Error('INVALID_ARGS: transactionId, hash e fintechId são obrigatórios.');
        }

        const [transactionId, hash, fintechId] = params;

        validateSha256(hash);

        const existing = await stub.getState(transactionId);
        if (existing && existing.length > 0) {
            throw new Error(`ALREADY_EXISTS: Transação '${transactionId}' já registrada.`);
        }

        const verificationId = uuidv4();
        const timestamp = toISOTimestamp(stub.getTxTimestamp());

    
        const hashRecord = {
            transactionId,
            hash,
            fintechId,
            verificationId,
            timestamp,
            docType: 'hashRecord',
        };

      
        await stub.putState(transactionId, Buffer.from(JSON.stringify(hashRecord)));

    
        return JSON.stringify({
            status: 'SUCCESS',
            verificationId,
            transactionId,
            timestamp,
        });
    }

    
    async VerifyIntegrity(stub, params) {
        if (params.length < 2) {
            throw new Error('INVALID_ARGS: transactionId e candidateHash são obrigatórios.');
        }

        const [transactionId, candidateHash] = params;

  
        validateSha256(candidateHash);

        const hashRecord = await getHashRecord(stub, transactionId);

        
        const intact = hashRecord.hash === candidateHash;

        
        return JSON.stringify({
            transactionId,
            verificationId:  hashRecord.verificationId,
            fintechId:       hashRecord.fintechId,
            registeredAt:    hashRecord.timestamp,
            verifiedAt:      toISOTimestamp(stub.getTxTimestamp()),
            status:          intact ? 'INTEGRITY_OK' : 'INTEGRITY_FAILED',
            intact,
            message: intact
                ? 'O hash confere com o registro na blockchain.'
                : 'O hash não corresponde ao registro.',
        });
    }

    async QueryHash(stub, params) {
        if (params.length < 1) {
            throw new Error('INVALID_ARGS: transactionId é obrigatório.');
        }

        const hashRecord = await getHashRecord(stub, params[0]);

        // Exclui docType da resposta — campo interno de indexação
        const { docType, ...publicRecord } = hashRecord; // eslint-disable-line no-unused-vars
        return JSON.stringify(publicRecord);
    }


    async GetTransactionsByFintech(stub, params) {
        if (params.length < 1) {
            throw new Error('INVALID_ARGS: fintechId é obrigatório.');
        }

        const [fintechId, pageSize, bookmark] = params;
        const pageSizeInt = parseInt(pageSize, 10) || 10;

        const query = JSON.stringify({
            selector: { docType: 'hashRecord', fintechId },
            sort: [{ timestamp: 'desc' }],
        });

        const { iterator, metadata } = await stub.getQueryResultWithPagination(
            query, pageSizeInt, bookmark || ''
        );

        // Coleta resultados paginados
        const records = [];
        let result = await iterator.next();
        while (!result.done) {
            const record = JSON.parse(result.value.value.toString());
            records.push({
                transactionId:  record.transactionId,
                verificationId: record.verificationId,
                timestamp:      record.timestamp,
                status:         'REGISTERED',
            });
            result = await iterator.next();
        }
        await iterator.close();

        // T-018: retorno estruturado com paginação completa
        return JSON.stringify({
            records,
            totalCount:  records.length,
            pageSize:    pageSizeInt,
            bookmark:    metadata.bookmark,
            hasMore:     metadata.bookmark !== '',
        });
    }


    async GetTransactionHistory(stub, params) {
        if (params.length < 1) {
            throw new Error('INVALID_ARGS: transactionId é obrigatório.');
        }

        const iterator = await stub.getHistoryForKey(params[0]);
        const history = [];

        let result = await iterator.next();
        while (!result.done) {
            history.push({
                txId:      result.value.txId,
                timestamp: toISOTimestamp(result.value.timestamp),
                isDelete:  result.value.isDelete,
                value:     result.value.value.toString(),
            });
            result = await iterator.next();
        }
        await iterator.close();

        if (history.length === 0) {
            throw new Error(`NOT_FOUND: Nenhum histórico para '${params[0]}'.`);
        }

        return JSON.stringify(history);
    }
}

module.exports = { HashVerification };
