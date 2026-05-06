'use strict';

const { HashVerification } = require('./lib/hashVerification');
const Shim = require('fabric-shim');

Shim.start(new HashVerification());
