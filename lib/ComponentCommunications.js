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

        bootstrap: function(app, cfg) {},
        
        Private: {
        }
    }}),
    
    /**
     * This code will only execute on the client side of a component.
     */
    Client: ComponentDef.defClient(function(Tools, Instance, Context) { return {
        /**
         * This client-side function tells the host to execute the given command of the given component.
         */
        sendRequestToHost: function(clientRequest) {},

        Public: {
            refresh: function() {},

            redirect: function(newLocation, inOldContext) {}
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
                var connection = this.getDefaultConnection();
                if (connection.client) {
                    connection.client.refresh();
                }
                else {
                    connection.refresh();
                }
            },

            redirect: function(newLocation, inOldContext) {
                var connection = this.getDefaultConnection();
                if (connection.client) {
                    connection.client.redirect(newLocation, inOldContext);
                }
                else {
                    connection.redirect(newLocation, inOldContext);
                }
            }
        }
    }}),

    
    Host: ComponentDef.defHost(function(SharedTools, Shared, SharedContext) {
        var onNewConnection = function(conn) {
            // do nothing for now
        };
    
        var Promise;
        var crypto;
        return {
            implementations: {},

            __ctor: function() {
                Promise = Shared.Libs.ComponentDef.Promise;
                crypto = require('crypto');
                
                this.events = {
                    connectionError: squishy.createEvent(this)
                };
            },

            generateRandomToken: function(len, symbols) {
                len = len || this.options.defaultLen;
                symbols = symbols || '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
                var nSymbols = symbols.length;
                var buf = crypto.randomBytes(len);
                var res = '';
                
                // only get `len` characters
                for (var i = 0; i < len; ++i) {
                    var nextByte = buf[i];
                    res += symbols[nextByte%nSymbols];      // map bytes to our given set of symbols
                }
                return res;
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

                onNewClient: function() {
                    // a bit of security
                    this.updateClientIdentity(true, true);
                },

                updateClientIdentity: function(dontSend, dontForce) {
                    if (!dontForce || !this.Context.session._identifierName) {
                        this.Context.session._identifierName = 'X-Nogap-Identity-' + this.Shared.generateRandomToken(16);
                        this.Context.session._identifierToken = this.Shared.generateRandomToken(32);

                        if (!dontSend) {
                            this.client.updateClientIdentityPublic({
                                identifierName: this.Context.session._identifierName,
                                identifierToken: this.Context.session._identifierToken,
                            });
                        }
                    }
                },

                getClientCtorArguments: function() {
                    return [{
                        identifierName: this.Context.session._identifierName, 
                        identifierToken: this.Context.session._identifierToken
                    }];
                },


                // ##############################################################################################################
                // Handle requests

                /**
                 * Whether this instance is currently running/has pending promises
                 */
                isExecutingRequest: function() {
                    return this.pendingResponsePromise.isPending();
                },

                verifyRequestMetadata: function(metadata) {
                    if (!this.Context.session._identifierName || !this.Context.session._identifierToken) {
                        return Promise.reject(makeError('error.internal', 'Session client identifier was not initialized during client request'));
                    }

                    var sentToken = metadata[this.Context.session._identifierName.toLowerCase()];
                    //console.error(this.Context.session._identifierName + ': ' + metadata[this.Context.session._identifierName]);
                    if (sentToken === this.Context.session._identifierToken) {
                        return Promise.resolve();
                    }
                    return Promise.reject('Unverified client request (hasToken: ' + !!sentToken + ')');
                },

                /**
                 * Used by endpoint implementations to execute and/or put commands.
                 * @return A promise that will return the Host's response to the given clientRequest.
                 */
                handleClientRPCRequest: function(requestMetadata, clientRequest) {
                    // make sure, client request is verified
                    return this.verifyRequestMetadata(requestMetadata)
                    .bind(this)
                    .then(function() {
                        // then handle client request
                        return this.executeCommandRequest(clientRequest.commands);
                    });
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
                        this.pendingResponsePromise = Promise.resolve();
                    }

                    // if there is still other stuff pending -> Wait until it's finished
                    this.pendingResponsePromise = this.pendingResponsePromise
                    .then(code);

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
                    .then(this.serializeRPCReturnValue.bind(this))
                    .catch(this.serializeRPCError.bind(this));
                },

                serializeRPCReturnValue: function(returnValue) {
                    // wrap return value
                    return {
                        value: returnValue,
                        err: null
                    };
                },

                serializeRPCError: function(err) {
                    // wrap error
                    this.Tools.handleError(err);
                    var isException = !!(err && err.stack);
                    return {
                        value: null,

                        // only send back message if error has stack
                        err: isException && 'error.internal' || err
                    };
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

            __ctor: function(clientIdentity) {
                this.updateClientIdentity(clientIdentity);

                Promise = Instance.Libs.ComponentDef.Promise;
                this._requestPacket = new this.PacketBuffer();
                this.events = {
                    refreshRequested: squishy.createEvent()
                };
            },

            updateClientIdentity: function(clientIdentity) {
                this._identity = clientIdentity;
            },

            prepareRequestMetadata: function(metadata) {
                if (!this._identity.identifierName || !this._identity.identifierToken) {
                    throw new Error('error.internal: session client identifier was not initialized before client request');
                }
                metadata[this._identity.identifierName] = this._identity.identifierToken;
            },

            initClient: function() {
                // add send method to Tools
                Tools.sendRequestToHost = function() {
                    var connection = this.getDefaultConnection();
                    var args = arguments;

                    return Promise.resolve()
                    .bind(this)

                    // first, send custom request to host
                    .then(function() {
                        return connection.sendRequestToHost.apply(connection, args);
                    })

                    // then handle response
                    .then(this.handleHostResponse)

                    // and interpret results
                    .then(function(results) {
                        return this.interpretHostResult(results);
                    });
                }.bind(this);
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
                    return this.interpretHostResult(result);
                }.bind(this));
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
                return this.getDefaultConnection().sendRequestToHost(clientRequest)

                // once received, handle reply sent back by Host
                .then(this.handleHostResponse);
            },

            interpretHostResult: function(result) {
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

            hasRefreshBeenRequested: function() {
                return this._refreshRequested;
            },

            Public: {
                updateClientIdentityPublic: function(clientIdentity) {
                    this.updateClientIdentity(clientIdentity);
                },

                /**
                 * Ask user if they want to refresh
                 */
                requestRefresh: function() {
                    this._refreshRequested = true;

                    this.events.refreshRequested.fire()
                    .bind(this)
                    .then(function() {
                        this.refresh();
                    })
                    .catch(function() {
                        // do nothing upon rejection
                    });
                }
            }
        };
    })
});

 
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
                     * Unsupported format: Provide the include string as-is.
                     */
                    raw: function(fname) {
                        return fname;
                    }
                }
            },

            Private: {
                getUserIdentifier: function() {
                    if (SharedContext.IsHost) {
                        // host
                        var req = this._lastReq;
                        return this.Shared.getIpAddress(req);
                    }
                    else {
                        // Not Yet Implemented on Client
                        return null;
                    }
                },

                getCurrentConnectionState: function() {
                    return this._currentConnectionState;
                }
            }
        };
    }),
    
    Host: ComponentDef.defHost(function(SharedTools, Shared, SharedContext) {
        var express;
        var ExpressRouters = {};

        var serializer;
        return {
            __ctor: function() {
                express = require('express');

                serializer = this.Serializer;

                // add a tool to add custom route handler for other HTTP requests
                SharedTools.ExpressRouters = ExpressRouters = {
                    // handle routes before NoGap
                    before: express.Router(),

                    // handle routes after NoGap
                    after: express.Router()
                };
            },

            initHost: function(app, cfg) {
                // set charset
                this.charset = cfg.charset;

                // pre-build <script> & <link> includes
                this.includeCode = Shared.Libs.ComponentAssets.getAutoIncludeAssets(this.assetHandlers);
            },

            /**
             * After all components have been initialized, this will register the NoGap core HTTP routers.
             */
            bootstrap: function(app, cfg) {
                // Order of request handlers:
                //   1. patchConnectionState
                //   2. ExpressRouters.before
                //   3. Bootstrap handler
                //   4. RPC request handler
                //   5. ExpressRouters.after

                squishy.assert(app.use && app.get && app.post, 'Invalid argument for initHost: `app` is not an express or express router object. ' +
                    'Make sure to pass an express application object to `ComponentLoader.start` when using ' +
                    'NoGap\'s default HttpPost implementation.');

                // add middleware to get instance for all non-bootstrap requests
                app.use(function patchConnectionState(req, res, next) {
                    // register error handler
                    var onError = function(err) {
                        Shared.Libs.ComponentCommunications.reportConnectionError(req, res, err);
                        next(err);
                    };
                    req.on('error', onError);

                    // assign Instance
                    req.Instance = this._activateInstanceForSession(req, false);
                    if (!req.Instance && this.checkForceActivatePreviouslyBootstrappedInstance(req, req.headers || {})) {
                        // create new instance anyway!
                        req.Instance = this._activateInstanceForSession(req, true);
                    }

                    req.getInstance = function() {
                        var Instance = req.Instance;
                        if (!Instance) {
                            var ipAddr = this.getIpAddress(req);
                            console.warn('[' + ipAddr + '] sent RPC request without authentication. Sending refresh.');

                            // Client did not bootstrap and had no cached instance.
                            // Tell Client to refresh (assuming the client's currently running Bootstrapper implementation supports it):
                            var responsePacket = Shared.Libs.ComponentCommunications.createSingleCommandPacket(
                                'ComponentCommunications', 'requestRefresh');
                            this.Def.InstanceProto.sendRPCResponseToClient(responsePacket, res);
                            res.end();
                            return null;
                        }
                        return Instance;
                    }.bind(this);

                    req.runInContext = function(_userCode) {
                        var Instance = req.getInstance();
                        if (!Instance) return;

                        var userCode = function() {
                            return _userCode(Instance);
                        };

                        return Instance.Libs.ComponentCommunications.executeInOrder(function() {
                            // run user code and serialize error or return value
                            return Instance.Libs.ComponentCommunications.executeUserCodeAndSerializeResult(userCode);
                        })

                        // then send it back
                        .then(function(hostResponseData) {
                            var connection = Instance.Libs.ComponentCommunications.getDefaultConnection();
                            connection.sendRPCResponseToClient(hostResponseData, res);
                        });
                    };

                    // run next
                    next();
                }.bind(this));

                // handle "before" routes
                app.use(ExpressRouters.before);

                // handle bootstrap requests (new Client)
                this._registerBootstrapRequestHandler(app, cfg);

                // handle RPC requests (existing Client)
                this._registerRPCRequestHandler(app, cfg);

                // handle "after" routes
                app.use(ExpressRouters.after);
            },

            getIpAddress: function(req) {
                // host
                var ipStr = null;
                if (req) {
                    // try to get IP
                    ipStr =  
                         (req.socket && req.socket.remoteAddress) ||
                         (req.connection && 
                            (req.connection.remoteAddress || 
                                (req.connection.socket && req.connection.socket.remoteAddress))) ||
                                req.headers['x-forwarded-for'];
                }
                else {
                    // no connection -> The call comes from inside the house (possibly via CommandPrompt)
                    ipStr = '<local>';
                }
                return ipStr;
            },

            /**
             * An instance that has already been established sent a request, but is not cached on server.
             * By default, Instance is required to reload.
             * Can add versioning externally, in order to determine whether to let the given instance keep working without reloading.
             */
            checkForceActivatePreviouslyBootstrappedInstance: function(connectionState, requestMetadata) {
                return false;
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

            _registerBootstrapRequestHandler: function(router, cfg) {
                // handle Client bootstrap requests
                router.get(cfg.baseUrl + "*", function(req, res, next) {
                    // register error handler to avoid application crash
                    var onError = function(err) {
                        Shared.Libs.ComponentCommunications.reportConnectionError(req, res, err);
                        next(err);
                    };
                    req.on('error', onError);

                    // This will currently cause bugs
                    // see: https://github.com/mikeal/request/issues/870
                    // req.socket.on('error', onError);

                    console.log('[' + this.getIpAddress(req) + '] Incoming client requesting `' + req.url + '`');

                    // create new Instance if client had none yet
                    var Instance = req.Instance = req.Instance || this._activateInstanceForSession(req, true);
                    
                    // handle the request
                    var connection = Instance.Libs.ComponentCommunications.getDefaultConnection();
                    connection._currentConnectionState = res;
                    connection._lastReq = req;

                    connection._handleClientBootstrapRequest(req, res, next)
                    .finally(function() {
                        connection._currentConnectionState = null;
                    });
                }.bind(this));
            },

            _registerRPCRequestHandler: function(router, cfg) {
                // listen for Client RPC requests
                router.post(cfg.baseUrl, function(req, res, next) {

                    var Instance = req.getInstance();
                    if (!Instance) {
                        // res.writeHead(401, {'Content-Type': 'text/html'});
                        // res.end();
                        return;
                    }

                    var connection = Instance.Libs.ComponentCommunications.getDefaultConnection();

                    // remember request object
                    connection._currentConnectionState = res;
                    connection._lastReq = req;


                    // extract body data
                    // see: http://stackoverflow.com/a/4310087/2228771
                    var body = '';
                    req.on('data', function (data) {
                        body += data;
                    });
                    req.on('end', function () {
                        // execute RPC request and send host's response back to client
                        connection.handleClientRPCRequestString(body, req.headers, res)
                        .finally(function() {
                            connection._currentConnectionState = null;
                        });
                    }.bind(this));
                }.bind(this));
            },

            Private: {
                __ctor: function() {
                },

                getClientCtorArguments: function() {
                    console.assert(this.Context.clientAddress, 'INTERNAL ERROR: clientRoot has not been set by ComponentBootstrap.');

                    // Make sure that client knows where to send its AJAX requests.
                    // If we don't have that, the client side of the component framework does not know how to send commands.
                    return [{
                        remoteAddress: this.Context.clientAddress,
                        remoteUrl: this.Context.clientRoot,
                        charset: this.Shared.charset
                    }];
                },

                onClientBootstrap: function() {
                    // assign remoteUrl to context
                    this.Context.remoteUrl = this.Context.clientRoot;
                },

                _handleClientBootstrapRequest: function(req, res, next) {
                    // store some client information
                    var clientRoot = req.protocol + '://' + req.get('host');
                    var clientAddress = req.connection.remoteAddress;
                    var isLocalConnection = clientAddress === 'localhost' || clientAddress === '127.0.0.1' || clientAddress === '::1';
                    
                    this.Context.clientAddress = clientAddress;
                    this.Context.clientIsLocal = isLocalConnection;
                    this.Context.clientRoot = clientRoot;
                    this.Context.clientNoHtml = req.headers['x-nogap-nohtml'];

                    console.time('boostrapping took');
                    // install new instance and generate client-side code
                    var ComponentBootstrapInstance = this.Instance.Libs.ComponentBootstrap;
                    return ComponentBootstrapInstance.bootstrapComponentInstance()

                    .catch(function(err) {
                        // something went wrong
                        //debugger;
                        ComponentBootstrapInstance.Tools.handleError(err);

                        // error!
                        next(err);
                    })

                    .bind(this)

                    // send bootstrap code to Client and kick things of, there
                    .then(function(codeString) {
                        if (!codeString) return;        // something went wrong
                    console.timeEnd('boostrapping took');

                        // determine charset
                        var charset = (this.charset || 'UTF-8');

                        // fix </script> tags in bootstrapping code
                        codeString = codeString.replace(/<\/script>/g, '\\x3c/script>');
                        codeString = JSON.stringify(codeString);

                        // send out bootstrapping page to everyone who comes in:
                        if (this.Context.clientNoHtml) {
                            // specialized client -> Only send JS code (JSON-formatted)
                            res.writeHead(200, {'Content-Type': 'application/json'});
                            res.write(codeString);
                        }
                        else {
                            // browser client
                            res.writeHead(200, {'Content-Type': 'text/html'});
                            res.write('<!doctype html>\n<html><head>');

                            // see: http://stackoverflow.com/questions/19156510/bootstrap-3-responsive-not-working-on-mobile
                            res.write('<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">');

                            // see: http://www.w3schools.com/tags/att_meta_charset.asp
                            res.write('<meta charset="' + charset + '" />');

                            // write CSS + JS external files
                            res.write(this.Shared.includeCode);

                            // done with head
                            res.write('</head><body>');

                            // write NoGap bootstrapping code
                            res.write('<script type="text/javascript" charset="' + charset + '">');
                            res.write('eval(eval(' + codeString + '))');
                            res.write('</script>');

                            // wrap things up
                            res.write('</body></html>');
                        }
                        res.end();
                    })
                    .finally(function() {
                        //console.log('Finished serving client: `' + req.url + '`');
                    })

                    // sending out the response went wrong
                    .catch(ComponentBootstrapInstance.Tools.handleError.bind(ComponentBootstrapInstance.Tools));
                },

                _serializeAndSendError: function(err, connectionState) {
                    var hostResponseData = [this.Instance.Libs.ComponentCommunications.serializeRPCError(err)];
                    return this.Instance.Libs.ComponentCommunications.executeInOrder(function() {
                        return hostResponseData;
                    })
                    .bind(this)
                    .then(function(packet) {
                        this.sendRPCResponseToClient(packet, connectionState);
                    });
                },

                handleClientRPCRequestString: function(requestString, requestMetadata, connectionState) {
                    var clientRequest;
                    try {
                        clientRequest = serializer.deserialize(requestString);
                    }
                    catch (err) {
                        // empty request is invalid
                        var maxLen = 800;
                        if (requestString.length > maxLen) {
                            // truncate to at most maxLen characters
                            requestString = requestString.substring(0, maxLen) + '...';
                        }
                        err = new Error('Invalid data sent by client cannot be parsed: ' + 
                            requestString + ' -- Error: ' + err.message || err);

                        this._serializeAndSendError(err, connectionState);
                        return;
                    }
                    
                    if (!clientRequest) {
                        // empty request is invalid
                        this._serializeAndSendError(new Error('Empty client request'), connectionState);
                        return;
                    }
                    
                    // handle the request
                    return this.handleClientRPCRequest(clientRequest, requestMetadata, connectionState);
                },

                handleClientRPCRequest: function(clientRequest, requestMetadata, connectionState) {
                    var Tools = this.Instance.Libs.ComponentCommunications.Tools;
                    
                    // Execute commands.
                    // Once finished executing, `sendRPCResponseToClient` will be called 
                    //      with the response packet to be interpreted on the client side.
                    return this.Instance.Libs.ComponentCommunications.handleClientRPCRequest(requestMetadata, clientRequest)
                    .then(function(hostResponseData) {
                        this.sendRPCResponseToClient(hostResponseData, connectionState);
                    }.bind(this))

                    // catch and handle any error
                    .catch(Tools.handleError.bind(Tools));
                },

                /**
                 * This Host-side function is called when a bunch of Client commands are to be sent to Client.
                 */
                sendRPCResponseToClient: function(hostResponseData, connectionState) {
                    // connectionState == HtppResponse object
                    console.assert(connectionState, 'Tried to call `sendRPCResponseToClient` without `connectionState` connection state object.');

                    // if response object is given, send right away
                    var hostResponseString;
                    try {
                        // Serialize
                        hostResponseString = serializer.serialize(hostResponseData);
                    }
                    catch (err) {
                        // produce pruned string representation
                        var commStr = squishy.objToString(hostResponseData, true, 3);

                        connectionState.statusCode = 500;
                        connectionState.end();

                        // then report error
                        throw new Error(
                            '[NoGap] Invalid remote method call: Tried to send too complicated object. ' + 
                            'Arguments to remote methods must be simple objects or functions (or a mixture thereof).\n' +
                            'Failed commands:\n ' + commStr + '. ' );
                    }

                    // flush response & close connection
                    connectionState.contentType('application/json');
                    connectionState.setHeader("Access-Control-Allow-Origin", "*");
                    connectionState.write(hostResponseString);
                    connectionState.end();
                    this._currentConnectionState = null;
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
            __ctor: function(_cfg) {
                cfg = _cfg;

                // store in Context
                Context.remoteAddress = cfg.remoteAddress;
                Context.remoteUrl = cfg.remoteUrl;
                Context.charset = cfg.charset;

                Context.clientIsLocal = cfg.remoteAddress === 'localhost' || cfg.remoteAddress === '127.0.0.1' || cfg.remoteAddress === '::1';

                Promise = Instance.Libs.ComponentDef.Promise;
                serializer = this.Serializer;
            },

            onBeforeSendRequestToHost: function(options) {
            },

            /**
             * This client-side function is called when a host command is called from a client component.
             * It will transport the commands to the host, wait for the reply, and then execute the commands that were sent back.
             */
            sendRequestToHost: function(clientRequestData, path, dontSerialize, requestMetadata) {
                // TODO: Add version number to metadata
                path = path || '';

                var ComponentCommunications = Instance.Libs.ComponentCommunications;
                if (ComponentCommunications.hasRefreshBeenRequested()) {
                    // already out of sync with server
                    return Promise.reject('Tried to send request to server, but already out of sync');
                }

                // add security and other metadata, required by NoGap
                requestMetadata = requestMetadata || {};
                ComponentCommunications.prepareRequestMetadata(requestMetadata);

                var options = {
                    clientRequestData: clientRequestData,
                    path: path,
                    dontSerialize: dontSerialize,
                    requestMetadata: requestMetadata
                };

                return Promise.resolve()
                .bind(this)
                .then(function() {
                    return this.onBeforeSendRequestToHost(options);
                })
                .then(function() {
                    return this.sendRequestToHostImpl(options);
                })
                .then(function(replyText) {
                    replyText = replyText || '';

                    // host sent hostReply back, in response to our execution request
                    var hostReply;
                    try {
                        // Deserialize
                        hostReply = serializer.deserialize(replyText, true) || {};
                    }
                    catch (err) {
                        console.error(err.stack);

                        // TODO: Better error handling
                        err = 'Unable to parse reply sent by host. '
                            + 'Check out http://jsonlint.com/ for more information. - \n'
                            + xhReq.responseText;
                        return Promise.reject(err);
                    }

                    // return host-sent data to caller
                    return hostReply;
                });
            },

            sendRequestToHostImpl: function(options) {
                var clientRequestData = options.clientRequestData;
                var path = options.path;
                var dontSerialize = options.dontSerialize;
                var requestMetadata = options.requestMetadata;


                var promise = new Promise(function(resolve, reject) {
                    // send Ajax POST request (without jQuery)
                    var xhReq = (typeof(XMLHttpRequest) !== 'undefined') ? new XMLHttpRequest() : 
                        ((typeof(ActiveXObject) !== 'undefined') && new ActiveXObject("Microsoft.XMLHTTP"));

                    if (!xhReq) {
                        throw new Error('Could not `sendRequestToHost` - `XMLHttpRequest` is not available.');
                    }
                    
                    // send out the command request
                    //console.log(cfg.remoteUrl);
                    xhReq.open('POST', cfg.remoteUrl + path, true);
                    if (!dontSerialize) {
                        xhReq.setRequestHeader('Content-type','application/json; charset=' + (cfg.charset || 'utf-8') + ';');
                        clientRequestData = serializer.serialize(clientRequestData);
                    }
                    for (var headerName in requestMetadata) {
                        xhReq.setRequestHeader(headerName, requestMetadata[headerName]);
                    }

                    //xhReq.setRequestHeader('Content-type','application/json');
                    xhReq.onerror = function() {
                        // TODO: Better error handling
                        // network-level failure
                        var err = new Error('connection error');
                        reject(err);
                    };

                    xhReq.onreadystatechange = function() {
                        if (xhReq.readyState != 4) return;
                        
                        if (xhReq.status==200) {
                            // success! Interpret host results!
                            resolve(xhReq.responseText);
                        }
                        else {
                            // TODO: Better error handling
                            // application-level failure
                            var err;
                            if (xhReq.status) {
                                var msg = xhReq.responseText || 'error.internal';
                                console.error('Invalid response from host - [' + xhReq.status + '] ' + msg);
                                err = msg;
                            }
                            else {
                                // connection probably got interrupted
                                var err = new Error('error.connection.lost');
                            }
                            reject(err);
                        }
                    };
                    
                    // send request
                    xhReq.send(clientRequestData);
                });

                return promise;
            },

            Public: {
                refresh: function() {
                    console.log('Page refresh requested. Refreshing...');
                    window.location.reload();
                },

                redirect: function(newLocation, inOldContext) {
                    // open new location (really: an URL)
                    window.open(newLocation, inOldContext ? null : '_blank');
                }
            },
        };
    })
};

// register default implementation types:
ComponentCommunications.registerImplType(HttpPostImpl);

module.exports = ComponentCommunications;