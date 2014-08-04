/**
 * Self-contained HelloWorld example.
 */
"use strict";


// ##########################################################################
// Define TwoWayStreetAsync  component

var NoGapDef = require('nogap').Def;

NoGapDef.component({
    Host: NoGapDef.defHost(function(Tools, Instance, Context) {
        var iAttempt = 0;

        return {
            initHost: function() {
                console.log('Host has initialized!');
            },

            Public: {
                tellClientSomething: function(sender) {
                    // signal that the client needs to wait for an asynchronous operation
                    this.Tools.keepOpen();

                    // wait 500 milliseconds before replying
                    setTimeout(function() {
                        this.client.showHostMessage('We have exchanged ' + ++iAttempt + ' messages.');

                        // signal that the client does not have to wait anymore for this operation
                        this.Tools.flush();
                    }.bind(this), 500);
                }
            }
        };
    }),

    Client: NoGapDef.defClient(function(Tools, Instance, Context) {
        return {
            initClient: function() {
                window.clickMe = function() {
                    document.body.innerHTML +='Button was clicked.<br />';
                    this.host.tellClientSomething();
                }.bind(this);

                document.body.innerHTML += '<button onclick="window.clickMe();">Click Me!</button><br />';
            },

            Public: {
                showHostMessage: function(msg) {
                    document.body.innerHTML +='Server said: ' + msg + '<br />';
                }
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