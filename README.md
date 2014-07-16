NoGap
=============

The NoGap framework delivers RPC + asset management + some other good stuff for enjoyable Host &lt;-> Client architecture development.

This module is called `No` `Gap` because it removes the typical gap that exists between
host and client and that makes a client<->server architecture so cumbersome to develop.

NoGap's primary use case is to develop rich client-side applications while alleviating the typical hassles of doing so.

Have a look at the [Samples](#samples) for reference.

This readme also outlines the typical [skeleton](#component-skeleton) of a NoGap component.

If you want to get serious, take a look at the [Getting Started](#getting_started) section to figure out how to build a complete Node-based web application with NoGap.

Note that currently, the only dependency of NoGap is `Node` and some of its modules but even that is planned to be removed in the future.



Installation
=============

* [Install Node](http://nodejs.org/download/)
    * Make sure to select `Add to PATH` during GUI-based installation.
* Open a command line
	* On Windows: Press `Ctrl+R` -> Type `cmd` -> `Enter`
* Run: `npm install nogap`
* Done.


[Samples](samples)<a name="samples"></a>
=============

The Samples highlight some (soon, all!) features of the NoGap framework and how they are used. To run the samples:

 1. Create a new folder (e.g. NoGapTest)
 2. Follow installation instructions given above
    * You now have a `node_modules/nogap` subfolder.
    * You can now work through the samples below and try it out in real-time
 4. `cd node_modules/nogap/samples/HelloWorld` (or any other sample)
 3. `npm install` (will automatically download and install the sample's dependencies)
 4. `npm start` (this will run the app defined in the sample's `package.json`)
 5. Open your browser and go to `localhost:1234` (or whatever port you are using)
 6. Start playing!


## [HelloWorld](samples/HelloWorld)

```js
var NoGapDef = require('nogap').Def;

module.exports = NoGapDef.component({
	Client: NoGapDef.defHost(function(Tools, Instance, Context) {
		return {
			initClient: function() {
				document.body.innerHTML = 'Hello World!';
			}
		};
	});
});
```

### Concepts
 * Get the NoGap module's `Def` helper: `var NoGapDef = require('nogap').Def;`
 * Define a new component: `NoGapDef.component({ ... });`
 * Add a `Client` definition to the component: `Client: NoGapDef.defClient(function(Tools, Instance, Context) { ... })`
 * Add `initClient` method  to `Client`

### What is the trick?
 * The `Client` code is automatically deployed to the client
 * `initClient` is then automatically called on the client, right after installation


## [TwoWayStreet](samples/TwoWayStreet)<a name="twowaystreet"></a>

```js
var NoGapDef = require('nogap').Def;

NoGapDef.component({
    Host: NoGapDef.defHost(function(SharedTools, Shared, SharedContext) {
        var iAttempt = 0;

        return {
            Public: {
                tellClientSomething: function() {
                    this.client.showHostMessage('We have exchanged ' + ++iAttempt + ' messages.');
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
```

### Concepts
 * Add a `Client` definition to the component: `Client: NoGapDef.defClient(function(Tools, Instance, Context) { ... })`
 * `Client.initClient`
 * Add a `Host` definition to the component: `Host: NoGapDef.defHost(function(SharedTools, Shared, SharedContext) { ... })`
 * `Host.Public`
 * `Client.Public`

### What is the trick?
 * `this.host` gives us an object on which we can call `Public` methods on the host
 	* For example, we can call `tellClientSomething` which is a method that was defined in `Host.Public`
 * Once the host receives our request, it calls `this.client.showHostMessage`
 * Note:
 	* Client: `this.host` vs.
 	* Host: `this.client`


## [TwoWayStreetAsync](samples/TwoWayStreetAsync)

Now that our code keeps growing and you are starting to get the picture, let us just focus on code snippets from now on.

Imagine the server had to do an asynchronous operation in [`tellClientSomething`](#twowaystreet).
For example, it needs to read a file, or get something from the database.

```js
tellClientSomething: function() {
    this.Tools.keepOpen();

    // wait 500 milliseconds before replying
    setTimeout(function() {
        this.client.showHostMessage('We have exchanged ' + ++iAttempt + ' messages.');
        this.Tools.flush();
    }.bind(this), 500);
}
```

### New Concepts
 * We need to perform an asynchronous request whose result is to be sent to the other side:
   * In that case, first call `this.Tools.keepOpen()`, so the client connection will not be closed automatically
   * Once you sent everything to the client, call `this.Tools.flush()`


## [CodeSharingValidation](samples/CodeSharingValidation)


```js
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
            setValue: function(value) {
                this.value = this.Shared.validateText(value);
                // ...
            }
        }
    };}),

    Client: NoGapDef.defClient(function(Tools, Instance, Context) { return {
        	// ...
                    value = this.validateText(value);
            // ...
    };})
```

### New Concepts
 * The `Base` definition is merged into both `Client` and `Host`
 * You can use it to easily share code between them



## [Assets](samples/Assets)

```js
NoGapDef.component({
    Host: NoGapDef.defHost(function(SharedTools, Shared, SharedContext) { return {
        Assets: {
            AutoIncludes: {
                js: [
                    // jquery
                    '//ajax.googleapis.com/ajax/libs/jquery/2.1.1/jquery.min.js'
                ],

                css: [
                    // bootstrap
                    '//netdna.bootstrapcdn.com/bootstrap/3.1.1/css/bootstrap.min.css'
                ]
            },

            Files: {
                string: {
                    view: 'template.html'
                }
            }
        }
    };}),

    Client: NoGapDef.defClient(function(Tools, Instance, Context) { return {
        initClient: function() {
            document.body.innerHTML += this.assets.view;
        }
    };})
});
```

### New Concepts
  * So far, you can define two types of file-based assets:
    * `AutoIncludes` defines lists of `js` and `css` files that will be automatically included in the client header
    * `Files` will be read and it's contents will be available through the clients `assets` variable.
      * Currently they can only be interpreted as string. Future plans: `code`, `image` and more more more...


## Multiple Components

This Sample is not done yet, but the [Simple Sample App](https://github.com/Domiii/NoGap/tree/master/samples/sample_app) already does this.
 
### Random Examples
  * `Shared.ComponentA.say('hello');`
  * `this.Instance.ComponentB.client.somePublicMethod(some, data);`



## [Dynamic Loading of Components](samples/DynamicallyLoadedComponents)

TODO: Sample not done yet...
 
### New Concepts
  * `this.Tools.requestClientComponents(names, callback);`


## [Simple Sample App](https://github.com/Domiii/NoGap/tree/master/samples/sample_app)

This App shows how to start building a real application with NoGap. It uses `Angular`, `Boostrap` and `Font-Awesome` to do some real client-side rendering. Important to note: None of these are required. You can build your frontend and backend any way you want.

<a name="component_skeleton"></a>Component Skeleton
=============

 * In addition to structure, a component can have a lot of `optional methods` that will be called during important events.
 * This skeleton summarizes (most of) those methods.


```js
/**
 * A complete Component skeleton
 */
"use strict";

var NoGapDef = require('nogap').Def;

module.exports = NoGapDef.component({
    /**
     * If no name is given, NoGap will use the filename as name.
     * If you define more than one unnamed component per file, you will see an error.
     */
    Name: undefined,

    /**
     * The `Base` definition is merged into both, `Host` and `Client`
     */
    Base: NoGapDef.defBase(function(SharedTools, Shared, SharedContext) {
        return {
            /**
             * Called right before `__ctor` of `Host` and `Client`.
             * Will be removed once called.
             */
            __ctor: function() {
            },

            /**
             * Called right before `initHost` and `initClient`.
             */
            initBase: function() {
            },

            /**
             * Private instance members.
             */
            Private: {
            },

            /**
             * Public instance methods that can be called by the other side.
             */
            Public: {
            }
        };
    }),

    Host: NoGapDef.defHost(function(SharedTools, Shared, SharedContext) {
        return {
            /**
             * The ctor is called only once, during NoGap initialization,
             * when the shared component part is created.
             * Will be removed once called.
             */
            __ctor: function () {
            },
		
	     /**
	      * Is called once on each component after all components have been created.
	      */
            initHost: function() {
            },

            /**
             * Private instance members.
             */
            Private: {
                /**
                 * Is called only once per session and application start, 
                 * when the instance for the given session has been created.
                 * Will be removed once called.
                 */
                __ctor: function () {
                },

                /**
                 * Called when a client connected.
                 */
                onNewClient: function() {
                },

                /**
                 * Called after `onNewClient`, once this component is bootstrapped on the client side.
                 * Since components can be deployed dynamically, this might happen much later, or never.
                 */
                onClientBootstrap: function() {
                }
            },

            /**
             * Public instance methods that can be called by the client.
             */
            Public: {
            },
        };
    }),

    Client: NoGapDef.defClient(function(Tools, Instance, Context) {
        return {
      	    /**
      	     * Called once after creation of the client-side instance.
      	     * Will be removed once called.
      	     */
            __ctor: function () {
            },

      	    /**
      	     * Called once after all currently deployed client-side 
      	     * components have been created.
      	     * Will be removed once called.
      	     */
            initClient: function() {

            },
            
            /**
             * This is optional and will be merged into the Client instance,
             * residing along-side the members defined above.
             */
            Private: {
            },

            /**
             * Public instance methods that can be called by the host.
             */
            Public: {
            }
        };
    })
});
```


<a name="getting_started"></a>Getting Started
=============

This tutorial is aimed at those who are new to `NoGap`, and new to `Node` in general.
It should help you bridge the gap from the [Code Snippets](#samples) to a real-world application.
Note that the [Simple Sample App](https://github.com/Domiii/NoGap/tree/master/samples/sample_app) is also following these guidelines.

## Recommended File Structure
    .
    +-- components/
    |	+-- models/
    |	+-- ui/
    +-- lib/
    +-- pub/
    +-- app.js
    +-- appConfig.js
    +-- package.json

This is the recommended file structure for the average web application. As always, the structure might look vastly different for special purpose applications.

### `components/`

This folder contains your `NoGap` components, and possibly (some of) their assets. You can name it anything you want.

NOTE: Placing assets (such as *.html templates, stylesheets, images etc.) next to code is actually good style, if it supports modularization.
If your components have a sufficiently modular design, you can simply copy their folder, to deploy them and their assets in other places.


### `components/models/`

This folder contains the interface with your DB and possibly other storage systems. They provide [CRUD](http://en.wikipedia.org/wiki/Create,_read,_update_and_delete) functionality to the rest of the application.


### `components/ui/`

This folder contains UI-related components. That is UI controller and view code. Views are in separate files from the code, but they can be in the same folder to support modularity.



### `app.js`

This defines your actual application. You can name it anything you want. Usually, this file only does three things:

 1. Setup your app
 2. Start `NoGap`
 3. Start your [`express` server](http://expressjs.com/4x/api.html)

Express is the standard Node way of starting a HTTP server and let clients connect.
Once it is running you can connect to it with your browser on the specified port.

NOTE: When using `NoGap` you will not need to work with express anymore (other than starting the server). You can use it, but you are recommended to use components instead.



### `appConfig.js`

This is your custom configuration file. You can name it anything you want.
It contains some basic constant data that your application needs, such as database login and other setup information.
The following is an example of a `NoGap` configuration. It requires at least two entries:

 * `baseFolder`
  	* This is the folder, relative to your application (e.g. `app.js`) where you defined all NoGap components.
 * `files`
 	* The actual component files (sans ".js"). Whenever you add a component, don't forget to list it here!


#### Optional Configuration parameters

 * `publicFolder` (Default = `pub/`)
 	* The folder to find all client asset files that cannot be found relative to a component.
 	* Usually this is used to store client-only and shared javascript libraries that do not have `NoGap` support (they are not defined as components).
 * `endpointImplementation.name` (Default = `HttpPost`)
 	* Currently, only POST is available. Websockets will follow soon.
 	* You can also implement your own transport layer if you want, but you probably don't.
 	* If you are interested into the dirty details, have a look at [`HttpPostImpl` in `ComponentCommunications.js`](https://github.com/Domiii/NoGap/blob/master/lib/ComponentCommunications.js#L564)

There are more, optional parameters. Documentation will come soon.


#### Example Config

```js
"nogap": {
    "baseFolder"   : "components",
    "publicFolder" : "pub",
    "files"        : [
        // list all components here:

        // utilities
        "ValidationUtil",

        // pages for guests
        "Guest",

        // pages for users
        "Main",
        "Home"
    ]
}
```


### package.json

This is the standard `Node` configuration file. Here you can declare your app's basic metadata and, most importantly, your dependencies.
If you need one of the thousands over thousands of publicly available `Node` modules, two steps are required:

 1. Add their name and your preferred version to `dependencies`
 2. Run `npm install`

Done. Now the new module is available in your code via:

`var someModule = require('some-module');`

where `some-module` is the name you gave it in the package.json file.

Check out [NPM JS](https://www.npmjs.org/) to see all available modules.



Final Words
=============

Good luck! You are recommended to take a look at the [`NoGap Sample App`](samples/sample_app) for a slightly more complete example of using `NoGap`.

In case of questions, feel free to contact me.
