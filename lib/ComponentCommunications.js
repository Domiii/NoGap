/**
 * This file defines the bottom layer of the component stack: The communication layer.
 */
"use strict";

var url = require('url');

var ComponentDef = require('./ComponentDef');
var process = require('process');
 
/**
 * This interface sets the rules and structure for transport layer implementations.
 *
 * @interface
 */
var ComponentTransportImpl = {
    ImplName: "<short name describing implementation type>",
    
    Host: ComponentDef.defHost(function(SharedTools, Shared, SharedContext) { return {
        initHost: function(app, cfg) {},
        
        Private: {
        }
    }}),
    
    /**
     * This code will only execute on the client side of a component.
     */
    Client: ComponentDef.defClient(function(Tools, Instance, Context) { return {
    
        Private: {
            /**
             * This client-side function tells the host to execute the given command of the given component.
             */
            sendClientRequestToHost: function(clientRequest) {},
        }
    }})
};


// ####################################################################################################################################
// ComponentCommunications

/**
 * This is the NoGap communication layer and manager of actual transport implementation.
 */
var ComponentCommunications = ComponentDef.lib({
    Base: ComponentDef.defBase(function(SharedTools, Shared, SharedContext) { return {
        /**
         * PacketBuffer is used to keep track of all data while a
         * request or response is being compiled.
         * @see http://jsfiddle.net/h5Luk/15/
         */
        PacketBuffer: squishy.createClass(function() {
            this._resetBuffer();
        }, {
            // methods

            /**
             * Buffers the given command request.
             * Will be sent at the end of the current (or next) client request.
             * @return Index of command in command buffer
             */
            bufferCommand: function(compNameOrCommand, cmdName, args) {
                var command;
                if (_.isString(compNameOrCommand)) {
                    // arguments are command content
                    command = {
                        comp: compNameOrCommand,
                        cmd: cmdName,
                        args: args
                    };
                }
                else {
                    // arguments are command itself
                    command = compNameOrCommand;
                }

                // if buffering, just keep accumulating and send commands back later
                this._buffer.commands.push(command);

                // return packet index
                return this._buffer.commands.length-1;
            },

            /**
             * Add an array of commands to the buffer.
             */
            bufferClientCommands: function(commands) {
                this._buffer.commands.push.apply(this._buffer.commands, commands);
            },

            /**
             * Compile request or response data.
             * Includes all buffered commands, as well as given commandExecutionResults and errors.
             * Resets the current command buffer.
             */
            compilePacket: function(commandExecutionResults) {
                var packetData = this._buffer;
                packetData.commandExecutionResults = commandExecutionResults;
                this._resetBuffer();
                return packetData;
            },

            _resetBuffer: function() {
                this._buffer = { 
                    commands: [],
                    commandExecutionResults: null
                };
            },
        }),

        __ctor: function() {
            console.assert(this.PacketBuffer);
        },

        /**
         * Sets the charset for all transport operations.
         * The default transport implementation bootstraps NoGap to the browser and
         * uses this charset to populate the corresponding META tag.
         */
        setCharset: function(charset) {
            this.charset = charset;
        },

        _getComponentTransportImplName: function(name) {
            //return 'ComponentTransportImpl_' + name;
            return '_ComponentTransportImpl';
        },

        /**
         * The current transport layer implementation
         */
        getComponentTransportImpl: function() {
            var transportImpl = Shared.Libs[this._getComponentTransportImplName()];
            console.assert(transportImpl, 'Could not lookup the Host endpoint of the transport layer implementation.');
            return transportImpl;
        },

        /**
         * Creates a response packet, containing a single command
         */
        createSingleCommandPacket: function(compName, cmdName, args) {
             return {
                commands: [{
                    comp: compName,
                    cmd: cmdName,
                    args: args
                }]
            };
        },

        Private: {
            /**
             * This user's connection implementation state object
             */
            getDefaultConnection: function() {
                return this.Instance.Libs[this.ComponentCommunications._getComponentTransportImplName()];
            },

            /**
             * Get an identifier for the current user.
             * For network transport layers (such as HTTP or WebSocket), this is usually the IP address.
             * For WebWorkers and other kinds of environments that can be a custom name, assigned during
             * initialization.
             */
            getUserIdentifier: function() {
                return this.getDefaultConnection().getUserIdentifier();
            },

            refresh: function() {
                this.getDefaultConnection().client.refresh();
            }
        }
    }}),

    
    Host: ComponentDef.defHost(function(SharedTools, Shared, SharedContext) {
        var onNewConnection = function(conn) {
            // do nothing for now
        };
    
        var Promise;
        return {
            implementations: {},

            __ctor: function() {
                Promise = Shared.Libs.ComponentDef.Promise;
                this.events = {
                    connectionError: squishy.createEvent(this)
                };
            },
            
            /**
             * Register a new endpoint implementation (e.g. using http-get, http-post, websockets, webworkers, or anything else...).
             */
            registerImplType: function(implType) {
                squishy.assert(typeof(implType) === 'object', 
                    'ComponentTransportImpl definition must implement the `ComponentTransportImpl` interface.');
                    
                squishy.assert(implType.ImplName, 'Unnamed ComponentTransportImpl is illegal. Make sure to set the `ImplName` property.');
                    
                // store it in implementations
                this.implementations[implType.ImplName] = implType;
            },
            
            /**
             * Initializes the host endpoint for the given hostComponents and registers the client endpoint.
             */
            setupCommunications: function(app, cfg) {
                // get implementation (HttpPost is the default)
                var implName = cfg.name || 'HttpPost';
                squishy.assert(this.implementations.hasOwnProperty(implName),
                    'ComponentTransportImpl of type "' + implName + 
                    '" does not exist. Available types are: ' + Object.keys(this.implementations));
                var implType = this.implementations[implName];

                // register implementation as lib (so we also get access to it on the client side)
                implType.Name = this._getComponentTransportImplName();
                ComponentDef.lib(implType);
            },

            /**
             * This should be called if there was any connection error.
             */
            reportConnectionError: function(req, res, err) {
                this.events.connectionError.fire(req, res, err);
            },


            Private: {
                /**
                 * Currently pending/executing Promise chain
                 */
                pendingResponsePromise: null,

                hostResponse: null,

                __ctor: function() {
                    this.hostResponse = new this.Shared.PacketBuffer();
                    this.pendingResponsePromise = Promise.resolve();
                },

                onClientBootstrap: function() {
                },


                // ##############################################################################################################
                // Handle requests

                /**
                 * Whether this instance is currently running/has pending promises
                 */
                isExecutingRequest: function() {
                    return this.pendingResponsePromise.isPending();
                },

                /**
                 * Used by endpoint implementations to execute and/or put commands.
                 * @return A promise that will return the Host's response to the given clientRequest.
                 */
                handleClientRequest: function(clientRequest) {
                    // client can currently only send commands (no results etc.)
                    return this.executeCommandRequest(clientRequest.commands);
                },

                /**
                 * Used by endpoint implementations to execute and/or put commands.
                 * @return A promise that will return a (potentially empty) return value for each of the requested commands.
                 */
                executeCommandRequest: function(commands) {
                    // start (or enqueue) command request
                    var next = function() {
                        return this.Instance.Libs.CommandProxy.executeClientCommands(commands);
                    }.bind(this);

                    return this.executeInOrder(next);
                },

                /**
                 * Execute the given function or promise once the all pending requests has been served.
                 * @return hostResponse data to be sent to client.
                 */
                executeInOrder: function(code) {
                    if (!this.pendingResponsePromise.isPending()) {
                        // queue is empty -> Start right away
                        // create new chain, so we don't keep all previous results until the end of time
                        this.pendingResponsePromise = code();
                    }
                    else {
                        // there is still other stuff pending -> Wait until it's finished
                        this.pendingResponsePromise = this.pendingResponsePromise
                        .then(code);
                    }

                    return this.pendingResponsePromise

                    // return client response, including commandExecutionResults
                    .then(this.hostResponse.compilePacket.bind(this.hostResponse));
                },

                /**
                 * Execute a piece of user code, wrapped in safety measures.
                 * Returns a promise, yielding the serialized result of the code execution.
                 */
                executeUserCodeAndSerializeResult: function(code) {
                    return Promise.resolve()
                    .bind(this)
                    .then(code)
                    .then(function(returnValue) {
                        // wrap return value
                        return {
                            value: returnValue,
                            err: null
                        };
                    })
                    .catch(function(err) {
                        // wrap error
                        this.Tools.handleError(err);
                        var isException = !!(err && err.stack);
                        return {
                            value: null,

                            // only send back message if error has stack
                            err: isException && 'error.internal' || err
                        };
                    });
                },

                /**
                 * Return and reset current hostResponse buffer.
                 */
                compileHostResponse: function(returnValues) {
                    return this.hostResponse.compilePacket(returnValues);
                }

                // /**
                //  * Skip the queue and run given code right away, while buffering
                //  * all resulting commands to be sent back to client.
                //  */
                // executeCommandRaisingCodeNow: function(commandRaisingCode) {
                //     // override response buffer
                //     var originalBuffer = this.hostResponse;
                //     var newBuffer = this.hostResponse = new PacketBuffer();

                //     return Promise.resolve(commandRaisingCode)
                //     .bind(this)
                //     .then(function(commandExecutionResults) {
                //         // reset buffer
                //         this.hostResponse = originalBuffer;

                //         // give back response data to be sent to client
                //         return newBuffer.compilePacket(commandExecutionResults);
                //     });
                // },
            }
        };
    }),
    
    
    Client: ComponentDef.defClient(function(Tools, Instance, Context) {
        var Promise;        // Promise library

        return {
            _requestPromise: null,
            _requestPacket: null,

            __ctor: function() {
                Promise = Instance.Libs.ComponentDef.Promise;
                this._requestPacket = new this.PacketBuffer();
            },

            /**
             * Add command to host, and send out very soon as part of a (small) batch.
             */
            sendCommandToHost: function(compName, cmdName, args) {
                // add command to buffer
                var returnIndex = this._requestPacket.bufferCommand(compName, cmdName, args);

                // do not send out every command on its own;
                // instead, always wait a minimal amount of time and then send
                // a batch of all commands together
                if (!this._requestPromise) {
                    this._requestPromise = Promise.delay(1)
                    .bind(this)
                    .then(this._sendClientRequestBufferToHost);
                }

                // send the corresponding return value back to caller
                return this._requestPromise
                .then(function(commandExecutionResults) {
                    var result = commandExecutionResults && commandExecutionResults[returnIndex];
                    if (!result) {
                        // nothing to return
                        return null;
                    }
                    else if (!result.err) {
                        // return result value
                        return result.value;
                    }
                    else {
                        // reject
                        return Promise.reject(result.err);
                    }
                });
            },

            /**
             * Actually send Client request to Host.
             * Compile response packet for client; includes all buffered commands.
             * Resets the current commandBuffer.
             */
            _sendClientRequestBufferToHost: function() {
                this._requestPromise = null;        // reset promise

                // compile and send out data
                var clientRequest = this._requestPacket.compilePacket();
                return this.getDefaultConnection().sendClientRequestToHost(clientRequest)

                // once received, handle reply sent back by Host
                .then(this.handleHostResponse);
            },

            /**
             * Host sent stuff. Run commands and return the set of returnValues.
             */
            handleHostResponse: function(hostReply) {
                if (hostReply.commands) {
                    // execute commands sent back by Host
                    Instance.Libs.CommandProxy.executeHostCommands(hostReply.commands);
                }

                // send return values sent by host back to callers
                return hostReply && hostReply.commandExecutionResults;
            },

            Public: {
            }
        };
    })
});

// TODO: CSRF
    // // token necessary for preventing CSRF: http://en.wikipedia.org/wiki/Cross-site_request_forgery
    // res.locals.csrfToken = req.session.csrfToken = req.session.csrfToken || tokenStore.generateTokenString();
    // // check if command exists and CSRF token matches
    // if (cmd && req.body.csrf === sess.csrfToken) {
        // cmd(req, res, next);
    // }
    // else {
        // next();
    // }

 
// ####################################################################################################################################
// HttpPost endpoint implementation

/**
 * Uses express + Ajax for transporting POST all NoGap data and requests.
 */
var HttpPostImpl = {
    ImplName: "HttpPost",

    Base: ComponentDef.defBase(function(SharedTools, Shared, SharedContext) {
        return {
            /**
             * Default serializer implementation, uses JSON.
             */
            Serializer: {
                /**
                 * Convert an object into a string.
                 * TODO: Consider using ArrayBuffer instead.
                 */
                serialize: function(obj) {
                    return squishy.objToString(obj, true);
                },

                /**
                 * Reconstruct object from string.
                 * TODO: Consider using ArrayBuffer instead.
                 */
                deserialize: function(objString, evaluateWithCode) {
                    if (evaluateWithCode) {
                        return eval('(' + objString + ')');
                    }
                    return JSON.parse(objString);
                }
            },

            /** 
             * Asset handlers are given to the Assets library for initializing assets.
             */
            assetHandlers: {
                /**
                 * Functions to fix asset filenames of given types.
                 */
                autoIncludeResolvers: {
                    js: function(fname) {
                        if (!fname.endsWith('.js')) fname += '.js';
                        return fname;
                    },
                    
                    css: function(fname) {
                        if (!fname.endsWith('.css')) fname += '.css';
                        return fname;
                    }
                },
                
                /**
                 * Functions to generate code for including external file assets.
                 * Also need to fix tag brackets because this string will be part of a script 
                 * that actually writes the asset code to the HTML document.
                 *
                 * @see http://stackoverflow.com/a/236106/2228771
                 */
                autoIncludeCodeFactories: {
                    js: function(fname) {
                        return '\x3Cscript type="text/javascript" src="' + fname + '">\x3C/script>';
                    },
                    css: function(fname) {
                        return '\x3Clink href="' + fname + '" rel="stylesheet" type="text/css">\x3C/link>';
                    },
                    
                    /**
                     * Unsupported format: Provide the complete include string.
                     */
                    raw: function(fname) {
                        return fname;
                    }
                }
            },
            

            Private: {
                getUserIdentifier: function() {
                    // Not Yet Implemented on Client
                    if (SharedContext.IsHost) {
                        var req = this._lastReq;
                        var ipStr = null;
                        if (req) {
                            // try to get IP
                            ipStr = req.headers['x-forwarded-for'] || 
                                 (req.socket && req.socket.remoteAddress) ||
                                 (req.connection && 
                                    (req.connection.remoteAddress || 
                                        (req.connection.socket && req.connection.socket.remoteAddress)));
                        }
                        return ipStr;
                    }
                    else {
                        // simple
                        return null;
                    }
                }
            }
        };
    }),
    
    Host: ComponentDef.defHost(function(SharedTools, Shared, SharedContext) {
        var serializer;
        return {
            __ctor: function() {
                serializer = this.Serializer;
            },

            initHost: function(app, cfg) {
                // set charset
                this.charset = cfg.charset;

                // pre-build <script> & <link> includes
                this.includeCode = Shared.Libs.ComponentAssets.getAutoIncludeAssets(this.assetHandlers);
            },

            /**
             * Initialize host-side endpoint implementation.
             * This delivers the low-level mechanism to transfer command requests between client & host.
             */
            bootstrap: function(app, cfg) {
                this._startBootstrapRequestListener(app, cfg);
                this._startRPCRequestListener(app, cfg);
            },

            _activateInstanceForSession: function(req, force) {
                var session = req.session;
                var sessionId = req.sessionID;
                console.assert(session,
                    'req.session was not set. Make sure to use a session manager before the components library, when using the default Get bootstrapping method.');
                console.assert(sessionId, 
                    'req.sessionID was not set. Make sure to use a compatible session manager before the components library, when using the default Get bootstrapping method.');
                
                // get or create Instance map
                var Instance = Shared.Libs.ComponentInstance.activateSession(session, sessionId, force);
                // console.assert(Shared.Libs.ComponentInstance.activateSession(session, sessionId), 
                //     'Session activation failed.');
                return Instance;
            },

            _startBootstrapRequestListener: function(app, cfg) {
                // listen for Client bootstrap requests
                app.get(cfg.baseUrl + "*", function(req, res, next) {
                    // register error handler to avoid application crash
                    var onError = function(err) {
                        Shared.Libs.ComponentCommunications.reportConnectionError(req, res, err);
                        next(err);
                    };
                    req.on('error', onError);

                    // This will currently cause bugs
                    // see: https://github.com/mikeal/request/issues/870
                    // req.socket.on('error', onError);

                    console.log('Incoming client requesting `' + req.url + '`');

                    var Instance = this._activateInstanceForSession(req, true);
                    
                    // handle the request
                    var implementationInstance = Instance.Libs.ComponentCommunications.getDefaultConnection();
                    implementationInstance._handleClientBootstrapRequest(req, res, next);
                }.bind(this));
            },

            _startRPCRequestListener: function(app, cfg) {
                squishy.assert(app.post, 'Invalid argument for initHost: `app` does not have a `post` method. ' +
                    'Make sure to pass an express application object to `ComponentLoader.start` when using ' +
                    'NoGap\'s default HttpPost implementation.');
                    
                // TODO: Add CSRF security!!!
            
                // listen for Client RPC requests
                app.post(cfg.baseUrl, function(req, res, next) {
                    // register error handler
                    var onError = function(err) {
                        Shared.Libs.ComponentCommunications.reportConnectionError(req, res, err);
                        next(err);
                    };
                    req.on('error', onError);

                    // extract body data
                    // see: http://stackoverflow.com/a/4310087/2228771
                    
                    var body = '';
                    req.on('data', function (data) {
                        body += data;
                    });
                    req.on('end', function () {
                        var clientRequest;
                        try {
                            clientRequest = serializer.deserialize(body);
                        }
                        catch (err) {
                            // empty request is invalid
                            err = new Error('Invalid data sent by client cannot be parsed: ' + 
                                body + ' -- Error: ' + err.message || err);
                            next(err);
                            return;
                        }
                        
                        if (!clientRequest) {
                            // empty request is invalid
                            next(new Error('Empty client request'));
                            return;
                        }

                        var Instance = this._activateInstanceForSession(req, false);

                        if (!Instance) {
                            // Client sent a command but had no cached instance.
                            // Tell Client to refresh (assuming the client's currently running Bootstrapper implementation supports it):
                            var responsePacket = Shared.Libs.ComponentCommunications.createSingleCommandPacket(
                                Shared.Libs.ComponentCommunications._getComponentTransportImplName(), 'refresh');
                            this._def.InstanceProto.sendResponseToClient(responsePacket, res);
                            return;
                        }
                        
                        // handle the request
                        var implementationInstance = Instance.Libs.ComponentCommunications.getDefaultConnection();
                        implementationInstance._handleClientRPCRequest(req, res, next, clientRequest);
                    }.bind(this));
                }.bind(this));
            },

            setGlobal: function(varName, varValue) {
                GLOBAL[varName] = varValue;
            },

            Private: {
                __ctor: function() {
                },

                onClientBootstrap: function() {
                    var clientRoot = this.Context.clientRoot;
                    console.assert(clientRoot, 'INTERNAL ERROR: clientRoot has not been set by ComponentBootstrap.');

                    // Make sure that client knows where to send its AJAX requests.
                    // If we don't have that, the client side of the component framework does not know how to send commands.
                    this.client.setConfig({
                        remoteUrl: clientRoot,
                        charset: this.Shared.charset
                    });
                },

                _handleClientBootstrapRequest: function(req, res, next) {
                    this._lastReq = req;

                    // get client root, so we know what address the client sees
                    var clientRoot = req.protocol + '://' + req.get('host');
                    var remoteAddr = req.connection.remoteAddress;
                    var ComponentBootstrapInstance = this.Instance.Libs.ComponentBootstrap;

                    // install new instance and generate client-side code
                    return ComponentBootstrapInstance.bootstrapComponentInstance(remoteAddr, clientRoot)

                    .bind(this)

                    .catch(function(err) {
                        // something went wrong
                        //debugger;
                        ComponentBootstrapInstance.Tools.handleError(err);

                        // error!
                        next(err);
                    })

                    // send bootstrap code to Client and kick things of there
                    .then(function(codeString) {
                        if (!codeString) return;        // something went wrong

                        // determine charset
                        var charset = (this.charset || 'UTF-8');

                        // fix </script> tags in bootstrapping code
                        codeString = codeString.replace(/<\/script>/g, '\\x3c/script>');

                        // send out bootstrapping page to everyone who comes in:
                        res.writeHead(200, {'Content-Type': 'text/html'});
                        res.write('<!doctype html>\n<html><head>');

                        // see: http://www.w3schools.com/tags/att_meta_charset.asp
                        res.write('<meta charset="' + charset + '" />');

                        // write CSS + JS external files
                        res.write(this.Shared.includeCode);

                        // done with head
                        res.write('</head><body>');

                        // write NoGap bootstrapping code
                        res.write('<script type="text/javascript" charset="' + charset + '">');
                        res.write('eval(eval(' + JSON.stringify(codeString) + '))');
                        res.write('</script>');

                        // wrap things up
                        res.write('</body></html>');
                        res.end();
                    })
                    .finally(function() {
                        //console.log('Finished serving client: `' + req.url + '`');
                    })

                    // sending out the response went wrong
                    .catch(ComponentBootstrapInstance.Tools.handleError.bind(ComponentBootstrapInstance.Tools));
                },

                _handleClientRPCRequest: function(req, res, next, clientRequest) {
                    // remember request object
                    this._lastReq = req;

                    var Tools = this.Instance.Libs.ComponentCommunications.Tools;
                    
                    // Execute commands.
                    // Once finished executing, `sendResponseToClient` will be called 
                    //      with the response packet to be interpreted on the client side.
                    return this.Instance.Libs.ComponentCommunications.handleClientRequest(clientRequest)
                    .then(function(hostResponse) {
                        this.sendResponseToClient(hostResponse, res);
                    }.bind(this))

                    // catch and handle any error
                    .catch(Tools.handleError.bind(Tools));
                },

                /**
                 * This Host-side function is called when a bunch of Client commands are to be sent to Client.
                 */
                sendResponseToClient: function(response, res) {
                    console.assert(res, 'Tried to call `sendResponseToClient` without `res` connection state object.');

                    // if response object is given, send right away
                    var commandStr;
                    try {
                        // Serialize
                        commandStr = serializer.serialize(response);
                    }
                    catch (err) {
                        // produce pruned string representation
                        var commStr = squishy.objToString(response, true, 3);

                        res.statusCode = 500;
                        res.end();

                        // then report error
                        throw new Error(
                            '[NoGap] Invalid remote method call: Tried to send too complicated object. ' + 
                            'Arguments to remote methods must be simple objects or functions (or a mixture thereof).\n' +
                            'Failed commands:\n ' + commStr + '. ' );
                    }

                    // flush response & close connection
                    res.contentType('application/json');
                    res.setHeader("Access-Control-Allow-Origin", "*");
                    res.write(commandStr);
                    res.end();
                },
            }
        };
    }),
    
    /**
     * This code will only execute on the client side of a component.
     */
    Client: ComponentDef.defClient(function(Tools, Instance, Context) {
        var cfg;
        var serializer;
        var Promise;

        return {
            __ctor: function() {
                Promise = Instance.Libs.ComponentDef.Promise;
                serializer = this.Serializer;
            },

            setGlobal: function(varName, varValue) {
                window[varName] = varValue;
            },

            /**
             * This client-side function is called when a host command is called from a client component.
             * It will transport the commands to the host, wait for the reply, and then execute the commands that were sent back.
             */
            sendClientRequestToHost: function(clientRequest) {
                var promise = new Promise(function(resolve, reject) {
                    // send Ajax POST request (without jQuery)
                    var xhReq = window.XMLHttpRequest ? new XMLHttpRequest() : new ActiveXObject("Microsoft.XMLHTTP");
                    
                    // send out the command request
                    //console.log(cfg.remoteUrl);
                    xhReq.open('POST', cfg.remoteUrl, true);
                    xhReq.setRequestHeader('Content-type','application/json; charset=' + (cfg.charset || 'utf-8') + ';');
                    //xhReq.setRequestHeader('Content-type','application/json');
                    xhReq.onerror = function() {
                        // TODO: Better error handling
                        // network-level failure
                        var err = 'AJAX request failed: ' + xhReq.responseText;
                        reject(err);
                    };
                    xhReq.onreadystatechange = function() {
                        if (xhReq.readyState != 4) return;
                        
                        if (xhReq.status==200) {
                            // host sent hostReply back, in response to our execution request
                            var hostReply;
                            try {
                                // Deserialize
                                hostReply = serializer.deserialize(xhReq.responseText || '', true) || {};
                            }
                            catch (err) {
                                console.error(err.stack);
                                // TODO: Better error handling
                                err = 'Unable to parse reply sent by host. '
                                    + 'Check out http://jsonlint.com/ for more information. - \n'
                                    + xhReq.responseText;
                                reject(err);
                                return;
                            }

                            // return host-sent data to caller
                            resolve(hostReply);
                        }
                        else {
                            // TODO: Better error handling
                            // application-level failure
                            var err = new Error('Invalid status from host: ' + xhReq.status + 
                                ' \n' + xhReq.responseText);
                            reject(err);
                        }
                    };
                    
                    // send request
                    var requestData = serializer.serialize(clientRequest);
                    xhReq.send(requestData);
                });

                return promise;
            },

            Public: {
                setConfig: function(newCfg) {
                    cfg = newCfg;
                },

                refresh: function() {
                    console.log('Page refresh requested. Refreshing...');
                    window.location.reload();
                }
            },
        };
    })
};

// register default implementation types:
ComponentCommunications.registerImplType(HttpPostImpl);

module.exports = ComponentCommunications;