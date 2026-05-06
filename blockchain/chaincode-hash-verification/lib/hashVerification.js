'use strict';

const { Contract } = require('fabric-contract-api');
const { v4: uuidv4 } = require('uuid');

class HashVerification extends Contract {

    // ─── Inicialização do Ledger ───────────────────────────────────────────────
    async InitLedger(ctx) {
        console.log('Chaincode HashVerification inicializado com sucesso.');
        return JSON.stringify({ status: 'OK', message: 'Ledger inicializado' });
    }

    // ─── RF01/RF02/RF03: Registrar Hash de Transação ───────────────────────────
    async RegisterHash(ctx, transactionId, hash, fintechId) {

        // Validação de parâmetros
        if (!transactionId || !hash || !fintechId) {
            throw new Error('INVALID_ARGS: transactionId, hash e fintechId são obrigatórios.');
        }

        // Validação do formato SHA-256 (64 caracteres hexadecimais)
        const sha256Regex = /^[a-fA-F0-9]{64}$/;
        if (!sha256Regex.test(hash)) {
            throw new Error('INVALID_HASH: O hash deve ser um SHA-256 válido (64 caracteres hexadecimais).');
        }

        // Verifica duplicidade
        const existing = await ctx.stub.getState(transactionId);
        if (existing && existing.length > 0) {
            throw new Error(`ALREADY_EXISTS: Transação '${transactionId}' já foi registrada na blockchain.`);
        }

        // Monta o registro — ZERO dados sensíveis do usuário
        const verificationId = uuidv4();
        const timestamp = new Date().toISOString();

        const hashRecord = {
            transactionId,
            hash,
            fintechId,
            verificationId,
            timestamp,
            docType: 'hashRecord'
        };

        // Persiste no ledger
        await ctx.stub.putState(transactionId, Buffer.from(JSON.stringify(hashRecord)));

        console.log(`Hash registrado: transactionId=${transactionId}, fintechId=${fintechId}`);

        return JSON.stringify({
            status: 'SUCCESS',
            verificationId,
            transactionId,
            timestamp
        });
    }

    // ─── RF04/RF05/RF06: Verificar Integridade de Transação ───────────────────
    async VerifyIntegrity(ctx, transactionId, candidateHash) {

        if (!transactionId || !candidateHash) {
            throw new Error('INVALID_ARGS: transactionId e candidateHash são obrigatórios.');
        }

        // Busca o registro no ledger
        const recordBytes = await ctx.stub.getState(transactionId);
        if (!recordBytes || recordBytes.length === 0) {
            throw new Error(`NOT_FOUND: Transação '${transactionId}' não encontrada na blockchain.`);
        }

        const hashRecord = JSON.parse(recordBytes.toString());

        // Comparação criptográfica
        const isIntact = hashRecord.hash === candidateHash;

        const result = {
            transactionId,
            verificationId: hashRecord.verificationId,
            fintechId: hashRecord.fintechId,
            registeredAt: hashRecord.timestamp,
            verifiedAt: new Date().toISOString(),
            status: isIntact ? 'INTEGRITY_OK' : 'INTEGRITY_FAILED',
            intact: isIntact
        };

        console.log(`Verificação: transactionId=${transactionId}, status=${result.status}`);

        return JSON.stringify(result);
    }

    // ─── RF04: Consultar Hash por ID ───────────────────────────────────────────
    async QueryHash(ctx, transactionId) {

        if (!transactionId) {
            throw new Error('INVALID_ARGS: transactionId é obrigatório.');
        }

        const recordBytes = await ctx.stub.getState(transactionId);
        if (!recordBytes || recordBytes.length === 0) {
            throw new Error(`NOT_FOUND: Transação '${transactionId}' não encontrada na blockchain.`);
        }

        return recordBytes.toString();
    }

    // ─── RF07: Consultar Histórico de Transações por Fintech ──────────────────
    async GetTransactionsByFintech(ctx, fintechId, pageSize, bookmark) {

        if (!fintechId) {
            throw new Error('INVALID_ARGS: fintechId é obrigatório.');
        }

        const pageSizeInt = parseInt(pageSize) || 10;

        // Rich query CouchDB — filtra por fintechId
        const query = {
            selector: {
                docType: 'hashRecord',
                fintechId: fintechId
            },
            sort: [{ timestamp: 'desc' }]
        };

        const queryString = JSON.stringify(query);

        // Paginação com bookmark
        const { iterator, metadata } = await ctx.stub.getQueryResultWithPagination(
            queryString,
            pageSizeInt,
            bookmark || ''
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

    // ─── RF08: Histórico de alterações de uma transação (audit trail) ─────────
    async GetTransactionHistory(ctx, transactionId) {

        if (!transactionId) {
            throw new Error('INVALID_ARGS: transactionId é obrigatório.');
        }

        const iterator = await ctx.stub.getHistoryForKey(transactionId);
        const history = [];

        let result = await iterator.next();
        while (!result.done) {
            const entry = {
                txId: result.value.txId,
                timestamp: new Date(result.value.timestamp.seconds.low * 1000).toISOString(),
                isDelete: result.value.isDelete,
                value: result.value.value.toString()
            };
            history.push(entry);
            result = await iterator.next();
        }

        await iterator.close();

        if (history.length === 0) {
            throw new Error(`NOT_FOUND: Nenhum histórico encontrado para '${transactionId}'.`);
        }

        return JSON.stringify(history);
    }
}

module.exports = { HashVerification };
