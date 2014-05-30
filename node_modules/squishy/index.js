/**
 * This file provides the squishy suite.
 */
/*jslint node: true */
"use strict";

module.exports = require('./lib/squishy');

// also attach Stacktrace and CodeBuilder to squishy for now (until we find a better place for them)
squishy.Stacktrace = require('./lib/squishy.Stacktrace');
squishy.CodeBuilder = require('./lib/squishy.CodeBuilder');