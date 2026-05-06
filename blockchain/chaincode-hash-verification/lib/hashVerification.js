'use strict';

const shim = require('fabric-shim');

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

        const sha256Regex = /^[a-fA-F0-9]{64}$/;
        if (!sha256Regex.test(hash)) {
            throw new Error('INVALID_HASH: O hash deve ser SHA-256 válido (64 caracteres hex).');
        }

        const existing = await stub.getState(transactionId);
        if (existing && existing.length > 0) {
            throw new Error(`ALREADY_EXISTS: Transação '${transactionId}' já registrada.`);
        }

        // Usa txId da transação blockchain como verificationId — determinístico nos dois peers
        const verificationId = stub.getTxID();
        const timestamp = new Date(stub.getTxTimestamp().seconds.low * 1000).toISOString();

        const hashRecord = {
            transactionId,
            hash,
            fintechId,
            verificationId,
            timestamp,
            docType: 'hashRecord'
        };

        await stub.putState(transactionId, Buffer.from(JSON.stringify(hashRecord)));

        return JSON.stringify({
            status: 'SUCCESS',
            verificationId,
            transactionId,
            timestamp
        });
    }

    async VerifyIntegrity(stub, params) {
        if (params.length < 2) {
            throw new Error('INVALID_ARGS: transactionId e candidateHash são obrigatórios.');
        }

        const [transactionId, candidateHash] = params;
        const recordBytes = await stub.getState(transactionId);

        if (!recordBytes || recordBytes.length === 0) {
            throw new Error(`NOT_FOUND: Transação '${transactionId}' não encontrada.`);
        }

        const hashRecord = JSON.parse(recordBytes.toString());
        const isIntact = hashRecord.hash === candidateHash;

        return JSON.stringify({
            transactionId,
            verificationId: hashRecord.verificationId,
            fintechId: hashRecord.fintechId,
            registeredAt: hashRecord.timestamp,
            verifiedAt: new Date(stub.getTxTimestamp().seconds.low * 1000).toISOString(),
            status: isIntact ? 'INTEGRITY_OK' : 'INTEGRITY_FAILED',
            intact: isIntact
        });
    }

    async QueryHash(stub, params) {
        if (params.length < 1) {
            throw new Error('INVALID_ARGS: transactionId é obrigatório.');
        }

        const recordBytes = await stub.getState(params[0]);
        if (!recordBytes || recordBytes.length === 0) {
            throw new Error(`NOT_FOUND: Transação '${params[0]}' não encontrada.`);
        }

        return recordBytes.toString();
    }

    async GetTransactionsByFintech(stub, params) {
        if (params.length < 1) {
            throw new Error('INVALID_ARGS: fintechId é obrigatório.');
        }

        const [fintechId, pageSize, bookmark] = params;
        const pageSizeInt = parseInt(pageSize) || 10;

        const query = JSON.stringify({
            selector: { docType: 'hashRecord', fintechId },
            sort: [{ timestamp: 'desc' }]
        });

        const { iterator, metadata } = await stub.getQueryResultWithPagination(
            query, pageSizeInt, bookmark || ''
        );

        const results = [];
        let result = await iterator.next();
        while (!result.done) {
            const record = JSON.parse(result.value.value.toString());
            results.push({
                transactionId: record.transactionId,
                verificationId: record.verificationId,
                timestamp: record.timestamp,
                status: 'REGISTERED'
            });
            result = await iterator.next();
        }
        await iterator.close();

        return JSON.stringify({
            records: results,
            totalCount: results.length,
            bookmark: metadata.bookmark,
            hasMore: metadata.bookmark !== ''
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
                txId: result.value.txId,
                timestamp: new Date(result.value.timestamp.seconds.low * 1000).toISOString(),
                isDelete: result.value.isDelete,
                value: result.value.value.toString()
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
