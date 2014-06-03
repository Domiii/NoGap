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
                            componentNames = Array.prototype.slice.call(arguments, 0);  // convert arguments to array
                        }
                        Instance.Libs.ComponentBootstrap.requestClientComponentsFromHost(componentNames);
                    },

                    /**
                     * Keeps buffering even after the current call ended.
                     * This is to signal the beginning of an asynchronous operation whose result is to be sent to the client.
                     */
                    keepOpen: function() {
                        Instance.Libs.ComponentCommunications.keepOpen();
                    },

                    /**
                     * Flushes the current buffer.
                     * This is to signal the end of an asynchronous operation whose result has already been sent to the client.
                     */
                    flush: function() {
                        Instance.Libs.ComponentCommunications.flush();
                    },

                     /**
                      * Tell client to refresh current page.
                      */
                    refresh: function() {
                        Instance.Libs.ComponentBootstrap.refresh();
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

                     /**
                      * Refresh current page.
                      */
                     Tools.refresh = Instance.Libs.ComponentBootstrap.refresh.bind(Instance.Libs.ComponentBootstrap);
                },
            },

            /**
             * Client commands can be directly called by the host
             */
            Public: {
            }
        };
    }),
});