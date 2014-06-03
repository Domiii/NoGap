/**
 * Self-contained HelloWorld example.
 */
"use strict";


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
    NoGapLoader.start(expressApp, {
        baseFolder: '.'
    });
})();


// ##########################################################################
// Start HTTP Server

(function startServer() {
    expressApp.set('port', 1234);

    try {
        expressApp.serverInstance = expressApp.listen(expressApp.get('port'), function() {
            console.log('NoGap Sample App is now up and running at port ' + expressApp.serverInstance.address().port);
        });
    }
    catch (err) {
        // exit on error
        process.exit(err);
    }
})();