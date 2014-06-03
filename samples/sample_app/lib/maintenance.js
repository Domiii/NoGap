/**
 * Process & general app management.
 * Features:
 *   -> Allows the user to add a clean-up hook for when the process exits.
 *   (That's it for now)
 */
"use strict";

var appConfig = require('../appConfig');
var process = require('process');


/**
 * The maintenance object for registering exit hooks.
 */
var maintenance = {
    events: {
        exit: squishy.createEvent()
    }
};


/**
 * Ensures graceful shutdown
 * See: http://stackoverflow.com/questions/14031763/doing-a-cleanup-action-just-before-node-js-exits
 */
(function() {
    var exited = false;
    function exitHandler(options, errOrCode) {
        try {
            if (exited) return;            // prevent recursive clean-up
            exited = true;
            
            // really kill this thing (WARNING: If the deferred code throws an exception, it will haunt you!)
            setTimeout(function() { process.exit(); }, 1);
            
            // TODO: Use printStackTrace to find the actual culprit right away (it's often buried between all kinds of node-internal stackframes)
            if (errOrCode && errOrCode.stack) console.error(errOrCode.stack);
            
            console.log('Shutting down...');
            
            // call all hooks for extra clean-up work
            try {
                maintenance.events.exit.fire(options, errOrCode, options.what);
            }
            catch (err) {
                console.error("ERROR during shutdown: " + err.stack);
            }
            
            // make sure, we don't keep reading from stdin (if we started reading)
            process.stdin.destroy();
            
            console.log('Shutdown complete. Bye bye!');
        }
        catch (err) {
            console.error("ERROR during shutdown: " + err.stack);
        }
    }

    // app is closing
    process.on('exit', exitHandler.bind(null,{what: 'exit'}));

    // aoo catches ctrl+c event
    process.on('SIGINT', exitHandler.bind(null, {what: 'SIGINT'}));

    // aoo catches uncaught exceptions
    process.on('uncaughtException', exitHandler.bind(null, {what: 'uncaughtException'}));
})();



module.exports = maintenance;