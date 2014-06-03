/**
 * This component is available in the client in all stages of the application.
 */
"use strict";

var NoGapDef = require('nogap').Def;


/**
 * Make sure, things work just right.
 */
module.exports = NoGapDef.component({
    Namespace: 'bjt',
    
    /**
     * The `Host` endpoint of a component lives in the host context and is also returned by `NoGapDef.component`.
     * Methods inside the `Public` instance prototype can be called by the client.
     */
    Host: NoGapDef.defHost(function(SharedTools, Shared, SharedContext) {
        return {
            Assets: {
                /**
                 * `AutoIncludes` defines two arrays: JS and CSS (and possibly other) files that will be included by the client.
                 * When deploying to a browser, these will appear in the document's head.
                 */
                AutoIncludes: {
                    js: [
                        // Angular JS
                        '//ajax.googleapis.com/ajax/libs/angularjs/1.2.10/angular.min.js',
                        
                        // bootstrap's logic (requires jquery)
                        '//ajax.googleapis.com/ajax/libs/jquery/2.1.1/jquery.min.js',
                        '//netdna.bootstrapcdn.com/bootstrap/3.1.1/js/bootstrap.min.js',
                    ],
                    css: [
                        // bootstrap & font-awesome make things look pretty
                        '//netdna.bootstrapcdn.com/bootstrap/3.1.1/css/bootstrap.min.css',
                        '//netdna.bootstrapcdn.com/font-awesome/4.0.3/css/font-awesome.css',

                        // normalize makes the entire page look equivalent across all browsers
                        'css/normalize.css',

                        // custom styles
                        'css/styles.css'
                    ]
                },

                /**
                 * The contents of assets defines in `Files` will be available to the client through the `asset` object.
                 * Look for `this.asset.view` below.
                 */
                Files: {
                    string: {
                        // main template
                        view: 'main.html'
                    }
                },
            },
            
            /**
             * Private members are instantiated once for each client, 
             * but cannot be directly accessed by the client.
             */
            Private: {
                onNewClient: function() {
                    // get session
                    var session = this.Context.session;

                    // get userName & start app on client
                    this.client.start(session.userName, this.Context.clientAddr);
                },
            },

            /**
             * Public members are instantiated once for each client, 
             * but cannot be directly accessed by the client.
             */
            Public: {
            }
        };
    }),
    


    // ####################################################################################################################
    // Client
    
    /**
     * The `Client` declaration is deployed to and then executed on the client.
     * Note that the function also needs to be executed on the `Host` just once to get the `Public` object.
     * That is why you should move any complex private variable initialization into `__ctor` or some other method.
     */
    Client: NoGapDef.defClient(function(Tools, Instance, Context) {
        /**
         * The currently rendered component.
         */
        var activePage;

        /**
         * The Angular app object.
         */
        var app;

        /**
         * The set of renderable components (which we call pages).
         */
        var pageStates = [];

        /**
         * Remember these Angular objects to update dirty parts of the view and lazily register partial templates.
         */
        var mainScope, mainTemplateCache;


        // ####################################################################################################################
        // Private methods

        /**
         * Create Angular app and setup main controller.
         */
        var setupApp = function() {
            // create & configure Angular app
            app = angular.module('app', []);
            app.
            config(['$controllerProvider', function($controllerProvider) {
                // we need this for lazy registration of new controllers
                // see: http://jsfiddle.net/8Bf8m/26/
                app.lazyController = $controllerProvider.register;
            }]).
            config( ['$provide', function ($provide){
                $provide.decorator('$browser', ['$delegate', function ($delegate) {
                    // Turn off the awful location service...
                    // This awfully badly written piece of software makes it impossible to use the standard browsing features and introduces random bugs...
                    // see: http://stackoverflow.com/questions/18611214/turn-off-url-manipulation-in-angularjs
                    $delegate.onUrlChange = function () {};
                    $delegate.url = function () { return ""; };
                    return $delegate;
                }]);
            }]);
            

            // create main Angular controller:
            app.controller('mainCtrl',
                ['$scope', '$templateCache', function($scope, $templateCache) {
                    // set page list
                    $scope.pageStates = pageStates;

                    // set user info
                    $scope.userName = Instance.Main.userName;
                    $scope.clientAddr = Instance.Main.clientAddr;

                    // remember $scope & $templateCache so we can lazily add partial templates later
                    mainScope = $scope;
                    mainTemplateCache = $templateCache;
                }]);
        };


        /**
         * Tell Angular to re-render dirty variables inside the main view.
         * @see http://stackoverflow.com/a/23769600/2228771
         */
        var invalidateView = function() {
            if (!mainScope.$$phase) mainScope.$apply();
        };

        return {
            initClient: function() {
                // set title
                document.title = 'Components Test App';

                // create app object
                setupApp();
                
                // add the contents of `main.html` to the body
                document.body.innerHTML = this.assets.view;
            },

            /**
             * Add new partial template to the main template.
             */
            addPage: function(component, template) {
                var This = this;
                var pageName = component._def.FullName;

                // add pageState to component
                component.pageState = {
                    name: pageName,
                    active: false
                };

                // add to `pageStates` array
                pageStates.push(component.pageState);

                // lazy loading of partial templates, using $templateCache:
                // see: http://jsfiddle.net/8Bf8m/29/
                mainTemplateCache.put(pageName, template);
            },


            /**
             * `onNewComponent` is called on every newly loaded component.
             */
            onNewComponent: function(component) {
                // we need to defer setup because Angular might not be ready yet
                angular.element(document).ready(function() {
                    // register page components
                    if (component.setupView) {
                        component.setupView(this, app);
                    }
                }.bind(this));
            },

            /**
             * Lazily load the given component, then render it's view (once available).
             */
            gotoPage: function(componentName) {
                // we can be sure, the component is available now, else the above function call would have generated an error
                var component = Instance[componentName];

                // deactivate current page
                if (activePage) {
                    activePage.pageState.active = false;
                }

                // activate new page
                activePage = component;
                component.pageState.active = true;

                // tell Angular to re-render dirty parts
                invalidateView();
            },

            /**
             * Check if userName is set, and then determine whether client is logged in  or not.
             */
            onUserChanged: function(userName) {
                this.userName = userName;

                if (!!userName) {
                    // logged in:
                    this.userName = userName;
                    console.log(this.userName);
                    if (mainScope) {
                        mainScope.userName = userName;
                    }
                    this.gotoPage('Home');
                }
                else {
                    // not logged in:
                    this.gotoPage('Guest');
                }
            },

            /**
             * `Public` methods can be called by the host directly.
             * However, these methods will also be merged into the `Client` object.
             * That is why we can call `this.gotoPage` which is defined above.
             */
            Public: {
                /**
                 * This method kickstarts the client-side installation of the application.
                 * This method is called after `initClient` was called.
                 * We don't put this code into `initClient` because `initClient` does not take arguments.
                 */
                start: function(userName, clientAddr) {
                    // store client address
                    this.clientAddr = clientAddr;

                    // we need to defer setup because Angular might not be ready yet
                    angular.element(document).ready(function() {
                        // set current user and select page to view correspondingly
                        this.onUserChanged(userName);
                    }.bind(this));
                }
            }
        };
    })
});