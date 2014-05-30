/**
 * This file provides the Tools objects. The tools object lets you 
 * conveniently perform component-related operations inside components.
 */
 "use strict";

 var ComponentDef = require('./ComponentDef');

 module.exports = ComponentDef.lib({
    Host: ComponentDef.defHost(function(SharedTools, Shared, SharedContext) {
        return {
            initHost: function() {
                // add some shared tools
            },

            /**
             * Create instance Tools object.
             */
            createInstanceTools: function(Instance, Context) {
                return {
                    requestClientComponents: function(componentNames) {
                        if (!(componentNames instanceof Array)) {
                            componentNames = Array.prototype.slice.call(arguments, 0);  // convert arguments set to array
                        }
                        Instance.Libs.ComponentBootstrap.requestClientComponentsFromHost(componentNames);
                    },

                    keepOpen: function() {
                        Instance.Libs.ComponentCommunications.keepOpen();
                    },

                    /**
                     * Flushes the current buffer.
                     * This is generally only needed for connections that are not always open, 
                     * and need to be explicitely kept open during and flushed after asynchronous transactions.
                     */
                    flush: function() {
                        Instance.Libs.ComponentCommunications.flush();
                    }
                };
            },
            
            Public: {
            }
        };
    }),


    Client: ComponentDef.defClient(function(Tools, Instance, Context) {
        return {
            Private: {
                initClient: function() {
                    // add some client tools
                    
                    /**
                     * Ask server for the given additional components.
                     */
                     Tools.requestClientComponents = Instance.Libs.ComponentBootstrap.requestClientComponents.bind(Instance.Libs.ComponentBootstrap);
                },
            },
                
            Public: {
            }
        };
    }),
});