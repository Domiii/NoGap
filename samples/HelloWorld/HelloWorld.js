/**
 * Self-contained HelloWorld example.
 */
"use strict";

const process = require('process');
process.on('uncaughtException', function (err) {
    console.error('[UNCAUGHT ERROR]');
    console.error(err.stack);
});

global.Promise = require("bluebird");


// ##########################################################################
// Define HelloWorld component

var NoGapDef = require('nogap').Def;

NoGapDef.component({
	Client: NoGapDef.defClient(function(Tools, Instance, Context) {
		return {
			initClient: function() {
				document.body.innerHTML = 'Hello World!';
			}
		};
	})
});


// ###########################################################################
// setup & start express

// load express
var express = require('express');
var cookieParser = require('cookie-parser');
var session = require('express-session');

var expressApp;
(function setupExpress() {
// start express
    expressApp = express();

    expressApp.use(cookieParser()); // required for `express-session` module

    expressApp.set('title', 'samples/HelloWorld');   // set title

    // install session manager:
    expressApp.use(session({
        // secret token
        secret: 'mySuperCoolSecret123qwerty',
        resave: true,
        saveUninitialized: true,
        
        // default cookie settings
        cookie: {
            path: '/',
            httpOnly: true
        },

        // We are not using a store, so our session won't persist through server re-starts.
        // store: ????
    }));
})();


// ##########################################################################
// Start NoGap

(function startNoGap() {
    var NoGapLoader = require('nogap').Loader;

    // use an inline configuration (instead of writing it to an extra file)
    return NoGapLoader.start(expressApp, {
        baseFolder: '.'
    });
})()
.then(() => {
    // ##########################################################################
    // Start HTTP Server

    try {
        expressApp.set('host', 'localhost');
        expressApp.set('port', 2345);

        expressApp.serverInstance = expressApp.listen(expressApp.get('port'), function() {
            var addr = expressApp.serverInstance.address();
            //console.log(`NoGap Sample App is now up and running at ${addr.address} : ${addr.port}`);
            console.log('NoGap Sample App is now up and running at port ' + addr.port);
        }).on('error', function (err) {
            //console.error(new Error('Server connection error (on port ' + expressApp.get('port') + '): ' + (err.stack || err.message || err)).stack);
            console.error(err.stack);
        });
    }
    catch (err) {
        // exit on error
        console.error(err.stack);
        //process.exit(err);
    }
});

module.exports = expressApp;