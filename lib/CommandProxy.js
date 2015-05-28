
/**
 * This file contains code for sending, executing and otherwise handling commands.
 */
"use strict";

var ComponentDef = require('./ComponentDef');

/**
 * A CommandProxy's methods are all commands of a particular Component endpoint (client or host).
 * Each such "command method" does not actually execute a command;
 * instead, it sends a command-execution request to the other side via the underlying ComponentTransportImpl.
 */
var CommandProxy = ComponentDef.lib({
    Host: ComponentDef.defHost(function(SharedTools, Shared, SharedContext) { 
    
        // constant defaults
        // TODO: Use config
        var maxCommandsPerRequest;

        // class for every host-side command proxy (the `client` object of each component instance)
        var ClientProxy;
        var HostDef;
        var Promise;

        /**
         * Add `client` proxy to given component instance
         */
        var addClientProxy = function(componentInstance) {
            // get all public commands
            var def = componentInstance.Shared.Def;
            var toCommandNames = def.commandsClient;
            if (!toCommandNames) return;    // ignore components that have no commands

            var client = componentInstance.client = new ClientProxy(componentInstance);
            
            // add all commands to the `ClientProxy`
            toCommandNames.forEach(function(methodName) {
                client[methodName] = function(argsssssssss) {
                    // client.someCommand(...) lands here:
                    var compName = this._componentInstance.Shared.Def.FullName;
                    var args = Array.prototype.slice.call(arguments, 0); // convert arguments to array

                    componentInstance.Tools.traceComponentFunctionCall(compName + '.client', methodName, args);

                    // append this proxied command to buffer
                    // which will be sent to Client when current (or next) Client response is sent back
                    var hostResponse = componentInstance.Instance.Libs.ComponentCommunications.hostResponse;
                    hostResponse.bufferCommand(compName, methodName, args);
                }.bind(client);
            }.bind(this));
        };

        return HostDef = {
            __ctor: function() {
                Promise = Shared.Libs.ComponentDef.Promise;
                ClientProxy = squishy.createClass(
                    function(componentInstance) {
                        this._componentInstance = componentInstance;
                    },{ 
                        toString: function() {
                            // TODO: Better string representation
                            return 'ClientProxy';
                        }
                });
            },

            /**
             * Adds the `client` property to every component.
             */
            initHost: function(app, cfg) {
                maxCommandsPerRequest = cfg.maxCommandsPerRequest === undefined && 1024 || cfg.maxCommandsPerRequest;
            },

            Private: {
                /**
                 * Called by ComponentBootstrap to create and attach a `client` property to each component instance.
                 */
                addClientCommandProxies: function() {
                    // create a `client` object for every component
                    this.Instance.forEachComponentOfAnyType(function(componentInstance) {
                        addClientProxy(componentInstance);
                    }.bind(this));
                },
            
                /**
                 * This is called when the Client sent some commands to the Host:
                 * Iterate and execute them in parallel.
                 * @return A promise that will deliver an array of `commandExecutionResults`, 
                 *      each corresponding to its respective entry in the `allCommands` array
                 */
                executeClientCommands: function(allCommands) {
                    if (maxCommandsPerRequest > 0 && allCommands.length > maxCommandsPerRequest) {
                        // TODO: This is to prevent basic command flooding, but needs improvement.
                        console.error('Client sent more commands than the allowed limit in a single request: ' + maxCommandsPerRequest + 
                            '. They are either cheating, or you are probably unrolling a request loop on client-side ' +
                            'and run the loop on the host side.');
                        return;
                    }
                    
                    // iterate over all given commands
                    return Promise.map(allCommands, function(command) {
                        var componentName = command.comp;
                        var methodName = command.cmd;
                        var args = command.args;

                        // TODO: More type- and other sanity checks!
                        
                        var componentInstance = this.Instance.getComponentOfAnyType(componentName);
                        if (!componentInstance) {
                            this.Tools.logWarn('sent invalid command for component: ' + componentName);
                        }

                        // make sure, command is not mal-formatted
                        else if (args && !(args instanceof Array)) {
                            this.Tools.logWarn('sent invalid command args for command: ' + 
                                componentInstance.Shared.Def.getFullInstanceMemberName('Public', methodName));
                        }
                        
                        // get arguments and command function
                        else if (!componentInstance.Shared.Def.Public[methodName] || !componentInstance[methodName]) {
                            this.Tools.logWarn('sent invalid command: ' + 
                                componentInstance.Shared.Def.getFullInstanceMemberName('Public', methodName));
                        }
                        else {
                            // trace the call
                            this.Tools.traceComponentFunctionCallFromSource('Client', componentName, methodName, args);

                            // call actual command, with arguments on the host object
                            return this.Instance.Libs.ComponentCommunications.executeUserCodeAndSerializeResult(function() {
                                return Promise.resolve()
                                .then(function() {
                                    return componentInstance[methodName].apply(componentInstance, args);
                                });
                            }.bind(this));
                        }
                    }.bind(this));
                },
            }
        };
    }),
    
    
    Client: ComponentDef.defClient(function(Tools, Instance, Context) {
        return {
            /**
             * Adds the `host` property to every component.
             */
            initClient: function() {
                // add the host property to every component
                Instance.forEachComponentOfAnyType(function(component) {
                    this._onNewComponent(component);
                }.bind(this));
            },

            /**
             * Add `host` object to every component.
             */
            _onNewComponent: function(component) {
                var compName = component.Def.FullName;
                console.assert(!component.host, 'Component `' + compName + '` defined reserved property `host`. Remove it!');
                console.assert(!component.client, 'Component `' + compName + '` defined reserved property `client`. Remove it!');
                console.assert(!component.clients, 'Component `' + compName + '` defined reserved property `clients`. Remove it!');
                
                var toCommandNames = component.Def.commandsHost;
                if (!toCommandNames) return;

                this._addHostCommandProxy(toCommandNames, component);
            },

            _addHostCommandProxy: function(toCommandNames, componentInstance) {
                // create `host` object
                var host = componentInstance.host = Object.create({
                    _componentInstance: componentInstance
                });
                
                // create proxy method for each command
                toCommandNames.forEach(function(methodName) {
                    host[methodName] = function(argsssssss) {
                        // this.host.someCommand(...) lands here:
                        var args = Array.prototype.slice.call(arguments, 0); // convert arguments to array
                        var componentName = componentInstance.Def.FullName;

                        // return promise of return value
                        this.Tools.traceComponentFunctionCall(componentName + '.host', methodName, args);
                        return Instance.Libs.ComponentCommunications.sendCommandToHost(
                            componentName, methodName, args)
                        .bind(componentInstance);    // bind host promises to host proxy's own instance by default
                    }.bind(this);
                }.bind(this));
            },
            
            /**
             * Host sent some commands. Iterate and execute them.
             * This is also the function that is called to kick-start the user application on the client side by executing initial commands.
             */
            executeHostCommands: function(allCommands) {
                // iterate over all commands
                for (var i = 0; i < allCommands.length; ++i) {
                    var command = allCommands[i];
                    this.executeHostCommand(command);
                }
            },

            executeHostCommand: function(command) {
                var componentName = command.comp;
                var methodName = command.cmd;
                var args = command.args;
                
                Tools.traceComponentFunctionCallFromSource('Host', componentName, methodName, args);
                
                var componentInstance = Instance.getComponentOfAnyType(componentName);
                if (!componentInstance) {
                    console.error('Host sent command for invalid component: ' + componentName + ' (' + methodName + ')');
                }
                else if (!componentInstance.Def.Public[methodName]) {
                    console.error('Host sent invalid command: ' + componentInstance.Def.getFullInstanceMemberName('Public', methodName));
                }
                else {
                    // call command
                    return componentInstance[methodName].apply(componentInstance, args);
                }
            },
        
            Public: {
            }
        };
    })
});

// we first load this on host side as a Node module and then send it of to the client by attaching it to the HostContext object
module.exports = CommandProxy;