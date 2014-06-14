/**
 * This file contains code for sending, executing and otherwise handling commands.
 */
"use strict";

var ComponentDef = require('./ComponentDef');

/**
 * A CommandProxy's methods are all commands of a particular Component endpoint (client or host).
 * Each such "command method" does not actually execute a command;
 * instead, it sends a command-execution request to the other side via the underlying ComponentEndpointImpl.
 */
var CommandProxy = ComponentDef.lib({
    Host: ComponentDef.defHost(function(SharedTools, Shared, SharedContext) { 
    
        // constant defaults
        // TODO: Use config
        var maxCommandsPerRequestDefault = 64;

        // class for every host-side command proxy (the `client` object of each component instance)
        var Client;

        var addClientCommandProxy = function(componentInstance) {
            // get all public commands
            var def = componentInstance.Shared._def;
            var toCommandNames = def.commandsClient;
            if (!toCommandNames) return;    // ignore components that have no commands

            var client = componentInstance.client = new Client(componentInstance);
            
            // add all commands to the `client` object
            toCommandNames.forEach(function(cmdName) {
                client[cmdName] = function(argsssssssss) {
                    // client.someCommand(...) lands here:
                    var compName = this._componentInstance.Shared._def.FullName;
                    var args = Array.prototype.slice.call(arguments, 0); // convert arguments to array
                    componentInstance.Instance.Libs.ComponentCommunications.sendCommandToClient(compName, cmdName, args);
                }.bind(client);
            }.bind(this));
        };

        var HostDef;
        return HostDef = {
            __ctor: function() {
                Client = squishy.createClass(
                    function(componentInstance) {
                        this._componentInstance = componentInstance;

                        Object.defineProperty(this, 'reply', {
                            value : function() {
                                if (!this.replyId) {
                                    console.warn(new Error(
                                        'Host called `reply` when there was no pending request expecting a reply for component `' +
                                        this._componentInstance.Shared._def.FullName + '`.').stack);
                                    return;
                                }

                                var args = Array.prototype.slice.call(arguments, 0); // convert arguments to array
                                this._componentInstance.Instance.Libs.ComponentCommunications.sendReply(this.replyId, args);

                                // unset replyId
                                this.replyId = 0;
                            }.bind(this)
                        });
                    },{
                        logError: function(msg) {
                            console.error(this + ' - ' + msg);
                        },

                        logWarn: function(msg) {
                            console.warn(this + ' - ' + msg);
                        },
                        
                        log: function(msg) {
                            console.log(this + ' - ' + msg);
                        },
                        
                        toString: function() {
                            // TODO: Better string representation
                            return 'Client';
                        }
                });
            },

            /**
             * Adds the `client` property to every component.
             */
            initHost: function() {
            },

            Private: {
                startCommandExecution: function() {
                    // connection management
                    this.Instance.Libs.ComponentCommunications.onStartCommandExecution();
                },
                
                finishCommandExecution: function() {
                    // connection management
                    this.Instance.Libs.ComponentCommunications.onFinishCommandExecution();
                },

                /**
                 * Called by ComponentBootstrap to create and attach a `client` property to each component instance.
                 */
                addClientCommandProxies: function() {
                    // create a `client` object for every component
                    this.Instance.forEachComponentOfAnyType(function(componentInstance) {
                        addClientCommandProxy(componentInstance);
                    }.bind(this));
                },
            
                /**
                 * This is called when the client sent some commands to the host: Iterate and execute them.
                 */
                executeClientCommandsNow: function(allCommands) {
                    if (allCommands.length > maxCommandsPerRequestDefault) {
                        // TODO: This is to prevent basic command flooding, but needs improvement.
                        console.error('Client sent more commands than the allowed limit in a single request: ' + maxCommandsPerRequestDefault + 
                            '. They are either cheating, or you are probably unrolling a request loop on client-side ' +
                            'and run the loop on the host side.');
                        return;
                    }
                    
                    // iterate over all given commands
                    for (var i = 0; i < allCommands.length; ++i) {
                        var command = allCommands[i];
                        var componentName = command.comp;
                        var commandName = command.cmd;
                        var args = command.args;
                        
                        var componentInstance = this.Instance.getComponentOfAnyType(componentName);
                        if (!componentInstance) {
                            // TODO: Proper logging & consequential actions?
                            componentInstance.client.logWarn('Client sent invalid command for component: ' + componentName);
                            break;
                        }
                        
                        // get arguments and command function
                        if (!componentInstance.Shared._def.Public[commandName] || !componentInstance[commandName]) {
                            // TODO: Proper logging & consequential actions?
                            componentInstance.client.logWarn('Client sent invalid command: ' + 
                                componentInstance._def.getFullInstanceMemberName('Public', commandName));
                            break;
                        }

                        if (args && !(args instanceof Array)) {
                            componentInstance.client.logWarn('Client sent invalid command args for command: ' + 
                                componentInstance._def.getFullInstanceMemberName('Public', commandName));
                            break;
                        }
                        
                        // handle special return callback
                        if (command.replyId) {
                            componentInstance.client.replyId = command.replyId;
                        }
                        
                        // call actual command, with arguments on the host object
                        componentInstance[commandName].apply(componentInstance, args);
                    }
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
                    this.onNewComponent(component);
                }.bind(this));
            },

            /**
             * Add `host` object to every component.
             */
            onNewComponent: function(component) {
                var compName = component._def.FullName;
                console.assert(!component.host, 'Component `' + compName + '` defined reserved property `host`. Remove it!');
                console.assert(!component.client, 'Component `' + compName + '` defined reserved property `client`. Remove it!');
                console.assert(!component.clients, 'Component `' + compName + '` defined reserved property `clients`. Remove it!');
                
                var toCommandNames = component._def.commandsHost;
                if (!toCommandNames) return;

                this.addHostCommandProxy(toCommandNames, component);
            },

            addHostCommandProxy: function(toCommandNames, componentInstance) {
                // create `host` object
                var host = componentInstance.host = Object.create({
                    _componentInstance: componentInstance
                });
                
                // create proxy method for each command
                toCommandNames.forEach(function(cmdName) {
                    host[cmdName] = function(argsssssss) {
                        // this.host.someCommand(...) lands here:
                        var args = Array.prototype.slice.call(arguments, 0); // convert arguments to array

                        return Instance.Libs.ComponentCommunications.sendCommandToHost(componentInstance._def.FullName, cmdName, args);
                    }.bind(this);
                }.bind(this));
            },
            
            /**
             * Host sent some commands. Iterate and execute them.
             * This is also the function that is called to kick-start the user application on the client side by executing initial commands.
             */
            execHostCommands: function(allCommands) {
                // iterate over all commands
                for (var i = 0; i < allCommands.length; ++i) {
                    var command = allCommands[i];
                    var componentName = command.comp;
                    var commandName = command.cmd;
                    var args = command.args;
                    
                    var componentInstance = Instance.getComponentOfAnyType(componentName);
                    if (!componentInstance) {
                        console.error('Host sent command for invalid component: ' + componentName + ' (' + commandName + ')');
                        continue;
                    }
                    
                    if (!componentInstance._def.Public[commandName]) {
                        console.error('Host sent invalid command: ' + componentInstance._def.getFullInstanceMemberName('Public', commandName));
                        continue;
                    }
                    
                    // call command
                    componentInstance[commandName].apply(componentInstance, args);
                }
            },
        
            Public: {
            }
        };
    })
});

// we first load this on host side as a Node module and then send it of to the client by attaching it to the HostContext object
module.exports = CommandProxy;