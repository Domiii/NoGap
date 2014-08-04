/**
 * Self-contained HelloWorld example.
 */
"use strict";


// ##########################################################################
// Define CodeSharingValidation component

var NoGapDef = require('nogap').Def;

NoGapDef.component({
    Base: NoGapDef.defBase(function(SharedTools, Shared, SharedContext) { return {
        validateText: function(text) {
            if (text.indexOf('a') >= 0 || text.indexOf('A') >= 0) {
                return null;
            }
            return text.trim();
        }
    };}),

    Host: NoGapDef.defHost(function(SharedTools, Shared, SharedContext) { return {
        Public: {
            setValue: function(sender, value) {
                this.value = this.Shared.validateText(value);

                var err;
                if (!this.value) {
                    err = 'This is not what I wanted!';
                }

                this.client.showHostMessage(err);
            }
        }
    };}),

    Client: NoGapDef.defClient(function(Tools, Instance, Context) { return {
        initClient: function() {
            window.submitText = function(form, cheat) {
                var value = form.text.value;
                if (!cheat) {
                    value = this.validateText(value);
                }

                if (value) {
                    document.body.innerHTML += 'Sending input to host: ' + value + '...<br />';
                    this.host.setValue(value);
                }
                else {
                    document.body.innerHTML += '<span style="background-color:pink">Invalid input:</span> ' + form.text.value + '<br />';
                }
            }.bind(this);

            document.body.innerHTML += 
                '<form><input name="text" type="text" placeholder="don\'t submit `a`!"></input><br />' +
                '<button type="button" onclick="window.submitText(this.form); return false;">Submit (with validation)</button>' + 
                '<button type="button" onclick="window.submitText(this.form, true); return false;">Cheat (without validation)</button><br /></form>';
        },

        Public: {
            showHostMessage: function(err) {
                if (err) {
                    document.body.innerHTML +='Host says: <span style="background-color:pink">' + err + '</span><br />';
                }
                else {
                    document.body.innerHTML +='<span style="background-color:LightGreen">Host likes your style!</span><br />';
                }
            }
        }
    };})
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