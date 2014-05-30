/**
 * This test app to show-case the `components` framework renders a simple web page.
 * We use Angular + Bootstrap + Font-Aweseom, but none of that is required to use components.
 */
"use strict";

// load express
var express = require('express');
var cookieParser = require('cookie-parser');
var session = require('express-session');

// load squishy
require('squishy');

// add shutdown handler
require('./lib/maintenance');
    
// load config
var appConfig = require('./appConfig');

// setup logging
require('./lib/logging');

// Warming up...
console.log('Starting server. Please wait...');

// setup express + session & cookie management
// Note: The default implementations for components bootstrapping and transport
//       require an express application object, as well as session mnagement, to work.
var app;
(function setupExpress() {
// start express
    app = express();

    app.use(cookieParser()); // required for `express-session` module

    app.set('title', 'Components Test App');   // set title

    // install session manager:
    app.use(session({
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


(function installComponents() {
    // Default way of including `Components`:
    //Components = require('components');

    // However, in this test app we load the library as global:
    // Usually, we don't do this, but in this case, it's better than having to deal with the ugly path of `index.js`.
    GLOBAL.Components = require('../index');

    // install components
    Components.Loader.start(app, appConfig.components);
})();

    
// fall back handler for unhandled routes:
app.use(function(req, res, next) {
    var err = new Error('Not Found: ' + req.originalUrl);
    err.status = 404;
    next(err);
});


// error handler
app.use(function(err, req, res, next) {
    var status = err.status || 500;
    console.warn('Invalid request (' + status + '): ' + err.stack || err);
    
    res.writeHead(status, {'Content-Type': 'text/html'});
    if (appConfig.dev) {
        res.write('<pre>' + err.stack + '</pre>');
    }
    res.end();
}); 
        
// start HTTP server:
(function startServer() {
    app.set('port', appConfig.httpd.port || 8080);

    try {
        app.serverInstance = app.listen(app.get('port'), function() {
            console.log('Test app is now up and running at port ' + app.serverInstance.address().port);
        });
    }
    catch (err) {
        // exit on error
        process.exit(err);
    }
})();


module.exports = app;

