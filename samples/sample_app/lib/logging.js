/**
 * Setup some basic logging stuff.
 */
"use strict";


// we use log4js
var log4js = require('log4js');

// get utilities
var StacktraceBuilder = squishy.Stacktrace;

// get config
var appConfig = require('../appConfig');
var loggingCfg = appConfig.logging;

// configure loggers
log4js.configure(
	{
  	"appenders": [
    {
      "type": "console",
      "category": "default"
    },
    {
      "type": "file",
      "filename": loggingCfg.defaultFile,
      "backups": 2,
      "category": "default"
    }  ],
  "replaceConsole": true
});


// ########################################################################################################################
// add source information to all logging

var defaultLogger = log4js.getLogger('default');

function patchConsole(methodName, log4jsMethodName) {
  //var fn = console[methodName];
  var fn = defaultLogger[log4jsMethodName || methodName];

	console[methodName] = function() {
	    var srcFrame = StacktraceBuilder.getStacktrace()[1];
	    var args = Array.prototype.slice.call(arguments, 0); // convert arguments to array
	    args[0] += ' \x1B[90m(' + srcFrame.fileName + ':' + srcFrame.row + ')\x1B[39m'; // append source to message

	    fn.apply(defaultLogger, args);
	};
};

patchConsole('log', 'info');
patchConsole('debug');
patchConsole('info');
patchConsole('warn');
patchConsole('error');


// ########################################################################################################################
// some basic logging utilities

module.exports = {
};