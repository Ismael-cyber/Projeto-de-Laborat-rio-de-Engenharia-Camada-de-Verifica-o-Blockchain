'use strict';
const sinon = require('sinon');
const chai = require('chai');
const sinonChai = require('sinon-chai');
const expect = chai.expect;

const { ChaincodeStub } = require('fabric-shim');
const { HashVerification } = require('../lib/hashVerification.js');

chai.use(sinonChai);

describe('Hash Verification Chaincode Tests', () => {
    let chaincodeStub, hashVerification;

    beforeEach(() => {
        chaincodeStub = sinon.createStubInstance(ChaincodeStub);
        chaincodeStub.getFunctionAndParameters.returns({ fcn: '', params: [] });
        
        chaincodeStub.putState.callsFake((key, value) => {
            if (!chaincodeStub.states) chaincodeStub.states = {};
            chaincodeStub.states[key] = value;
        });

        chaincodeStub.getState.callsFake(async (key) => {
            return Promise.resolve(chaincodeStub.states ? chaincodeStub.states[key] : undefined);
        });

        chaincodeStub.getTxID.returns('tx123456789');
        chaincodeStub.getTxTimestamp.returns({ seconds: { low: 1622548800 } });

        hashVerification = new HashVerification();
    });

    describe('Test InitLedger', () => {
        it('should return success on InitLedger', async () => {
            let result = await hashVerification.InitLedger(chaincodeStub);
            expect(JSON.parse(result)).to.deep.equal({ status: 'OK', message: 'Ledger inicializado' });
        });
    });

    describe('Test RegisterHash', () => {
        it('should throw error if parameters are missing', async () => {
            try {
                await hashVerification.RegisterHash(chaincodeStub, ['tx-001', 'hash']);
                expect.fail('Should have thrown an error');
            } catch (err) {
                expect(err.message).to.contain('INVALID_ARGS');
            }
        });

        it('should throw error if hash is not 64 hex characters', async () => {
            try {
                await hashVerification.RegisterHash(chaincodeStub, ['tx-001', 'invalidhash', 'fintech-01']);
                expect.fail('Should have thrown an error');
            } catch (err) {
                expect(err.message).to.contain('INVALID_HASH');
            }
        });

        it('should register a hash successfully', async () => {
            const validHash = 'a'.repeat(64);
            let result = await hashVerification.RegisterHash(chaincodeStub, ['tx-001', validHash, 'fintech-01']);
            
            let parsedResult = JSON.parse(result);
            expect(parsedResult.status).to.equal('SUCCESS');
            expect(parsedResult.transactionId).to.equal('tx-001');
            
            let savedState = JSON.parse((await chaincodeStub.getState('tx-001')).toString());
            expect(savedState.transactionId).to.equal('tx-001');
            expect(savedState.hash).to.equal(validHash);
            expect(savedState.fintechId).to.equal('fintech-01');
        });
    });
});