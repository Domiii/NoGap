NoGap
=============

The NoGap framework delivers [RPC (Remote Procedure Call)](http://en.wikipedia.org/wiki/Remote_procedure_call) + improved code sharing + asset management + some other good stuff for enjoyable Host &lt;-> Client architecture development.

NoGap's primary use case is development of rich single-page, client-side applications while alleviating the typical hassles of doing so.

This module is called `No` `Gap` because it removes the typical gap that exists between
host and client and that makes a Client <-> Server architecture so cumbersome to develop.

You probably want to start by having a look at the [Samples](#samples) for reference.

If you want to get serious, take a look at the [Getting Started](#getting_started) section to figure out how to build a complete Node-based web application with NoGap.

When starting on a new component, you can save a bit of time by copying the [typical component skeleton code](#component_skeleton) from the [Structure of NoGap components](#component_structure) section.

Note that currently, the only dependency of NoGap is `Node` and some of its modules but even that is planned to be removed in the future.

NOTE: NoGap is still in Beta. Things are still changing. If you are concerned about that, feel free to contact me directly.


Table of Contents
=============



<!-- toc -->

* [HelloWorld](#helloworld)
* [Installation](#installation)
* [Samples](#samples)
  * [HelloWorld](#helloworld)
  * [TwoWayStreet](#twowaystreet)
  * [TwoWayStreetAsync](#twowaystreetasync)
  * [CodeSharingValidation](#codesharingvalidation)
  * [Assets](#assets)
  * [Multiple Components](#multiple-components)
  * [Dynamic Loading of Components](#dynamic-loading-of-components)
  * [Request &lt;-> Reply Pairs](#request-lt-reply-pairs)
  * [Simple Sample App](#simple-sample-app)
* [Component Structure](#component-structure)
  * [`Host`](#host)
  * [`Client`](#client)
  * [`Base`](#base)
  * [Component Skeleton](#component-skeleton)
* [Getting Started](#getting-started)
  * [Recommended File Structure](#recommended-file-structure)
    * [`components/`](#components)
    * [`components/models/`](#componentsmodels)
    * [`components/ui/`](#componentsui)
    * [`app.js`](#appjs)
    * [`appConfig.js`](#appconfigjs)
    * [package.json](#packagejson)
* [Debuggability & security](#debuggability-security)
* [Important Terms](#important-terms)
* [Final Words](#final-words)

<!-- toc stop -->



HelloWorld
=============
[Link](samples/HelloWorld).

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

**Concepts**
 * Get the NoGap module's `Def` helper: `var NoGapDef = require('nogap').Def;`
 * Define a new component: `NoGapDef.component({ ... });`
 * Add a `Client` definition to the component: `Client: NoGapDef.defClient(function(Tools, Instance, Context) { ... })`
 * Add `initClient` method  to `Client`

**What is the trick?**
 * The `Client` code is automatically deployed to the client
 * `initClient` is then automatically called on the client, right afterwards


Installation
=============

* [Install Node](http://nodejs.org/download/)
    * Make sure to select `Add to PATH` during GUI-based installation.
* Open a command line
  * On Windows: Press `Ctrl+R` -> Type `cmd` -> `Enter`
* Run: `npm install nogap`
* Done.


Samples
=============
[Link](samples).<a name="samples"></a>

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


## HelloWorld
[Link](samples/HelloWorld).


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

**Concepts**
 * Get the NoGap module's `Def` helper: `var NoGapDef = require('nogap').Def;`
 * Define a new component: `NoGapDef.component({ ... });`
 * Add a `Client` definition to the component: `Client: NoGapDef.defClient(function(Tools, Instance, Context) { ... })`
 * Add `initClient` method  to `Client`

**What is the trick?**
 * The `Client` code is automatically deployed to the client
 * `initClient` is then automatically called on the client, right after installation


## TwoWayStreet
[Link](samples/TwoWayStreet).<a name="twowaystreet"></a>

```js
var NoGapDef = require('nogap').Def;

NoGapDef.component({
    Host: NoGapDef.defHost(function(SharedTools, Shared, SharedContext) {
        var iAttempt = 0;

        return {
            Public: {
                tellClientSomething: function(sender) {
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

**Concepts**
 * Add a `Client` definition to the component: `Client: NoGapDef.defClient(function(Tools, Instance, Context) { ... })`
 * `Client.initClient`
 * Add a `Host` definition to the component: `Host: NoGapDef.defHost(function(SharedTools, Shared, SharedContext) { ... })`
 * `Host.Public`
 * `Client.Public`

**What is the trick?**
 * `this.host` gives us an object on which we can call `Public` methods on the host
  * For example, we can call `tellClientSomething` which is a method that was defined in `Host.Public`
 * Once the host receives our request, it calls `this.client.showHostMessage`
 * Note:
  * Client: `this.host` vs.
  * Host: `this.client`


## TwoWayStreetAsync
[Link](samples/TwoWayStreetAsync).

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

**New Concepts**
 * We need to perform an asynchronous request whose result is to be sent to the other side:
   * In that case, first call `this.Tools.keepOpen()`, so the client connection will not be closed automatically
   * Once you sent everything to the client, call `this.Tools.flush()`


## CodeSharingValidation
[Link](samples/CodeSharingValidation).


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
            setValue: function(sender, value) {
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

**New Concepts**
 * The `Base` definition is merged into both `Client` and `Host`
 * You can use it to easily share code between them



## Assets
[Link](samples/Assets).

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

**New Concepts**
  * So far, you can define two types of file-based assets:
    * `AutoIncludes` defines lists of `js` and `css` files that will be automatically included in the client header
    * `Files` will be read and it's contents will be available through the clients `assets` variable.
      * Currently they can only be interpreted as string. Future plans: `code`, `image` and more more more...


## Multiple Components

The [Simple Sample App](https://github.com/Domiii/NoGap/tree/master/samples/sample_app/components) already does this.
 
**Examples of multi-component code**
  * Call `say` on `ComponentA`: `Shared.ComponentA.say('hello');`
  * Call `somePublicMethod` on the client of a `ComponentB` instance: `this.Instance.ComponentB.client.somePublicMethod(some, data);`



## Dynamic Loading of Components
<!-- [Link](samples/DynamicLoading). -->

This feature lets clients request components on demand. This way, complex web applications can send code and assets not before they are needed, thus saving bandwidth and improving I/O performance.

TODO: Sample not done yet...
 
**New Concepts**
  * First, set `lazyLoad` to `1` in the config
  * Then, call `this.Tools.requestClientComponents(names, callback);` to lazily load components from `Host` or from `Client` *instance objects*.


## Request &lt;-> Reply Pairs
<!-- [Link](samples/). -->

This feature 

TODO: Sample not done yet...

Idea:

    Host: {
      Public: {
        checkIn: function(sender, name) {
          sender.reply('interesting! - ' + some, myStuff);
        }
      }
    }

    // ...

    Client: {

      // ...

      initClient: {
        this.Host.checkIn('Average Joe')
        .onReply(function(message, stuff) {
          // server sent something back
          // ...
      });
      }
    }
 
**Concepts**
  * When calling a `Host.Public` method, in addition to the arguments sent by the client, there is an argument injected before all the others, called `sender`.
  * When calling a `Host.Public` method, you can register a callback by calling `onReply`.
  * The `Host` can then call `sender.reply` which will lead to the `onReply` callback to be called.


## Simple Sample App
[Link](samples/sample_app).

This App shows how to start building a real application with NoGap. It uses `Angular`, `Boostrap` and `Font-Awesome` to do some real client-side rendering. IMPORTANT: None of these libraries are required. You can build your frontend and backend any way you want.


Component Structure
=============
<a name="component_structure"></a>

NOTE: The following is a rough explanation of many of NoGap's features. You are recommended to compare the explanation to their actual implementation in the [Simple Sample App](samples/sample_app) to better understand them.

Every component has two endpoint definitions, called `Host` and `Client`, as well as shared code, inside the so-called `Base` definition. You provide `Host`, `Client` and `Base` definitions by calling `defHost`, `defClient` and `defBase` respectively. The only argument to the `def` function is your **component definition**: A function with three arguments that returns the actual definition object.

## `Host`
`Host` has two places for defining functionality: Shared and instance. This distinction is necessary because a `Host` can be tied to multiple `Client`s. Note though that each `Client` can only be tied to a single `Host` (as of now).

 1. The **shared object** of a component exists only once for the entire application. It is what is returned if you `require` the component file in Node. You can access all of shared component objects through the `Shared` set which is the second argument of every `Host`'s *component definition*.

2. The **instance object** of a component exists once for every client. Every client that connects to the server, gets its own set of instances of every active component. On the `Host` side, the *instance object* of a component is defined as the merged result of all members of `Private` and `Public` which we call *instance members*. These instance members are accessible through `this.Instance` from **instance code**, that is code inside of `Private` and `Public` properties. If you want to hook into client connection and component bootstrapping events, simply defined `onNewClient` or `onClientBootstrap` functions inside `Host.Private`. You can access the respective *shared members* through `this.Shared` from *instance code*.
Inside a `Host` instance object, you can directly call `Public` instance members on the client through `this.client.someClientPublicMethod(some, data)`. Being able to directly call a function on a different computer or in a different program is called [RPC (Remote Procedure Calls)](http://en.wikipedia.org/wiki/Remote_procedure_call). Similarly, `Client` instances can directly call `this.host.someHostPublicMethod`. Note that when you call `Host.Public` methods, an argument gets injected before all other arguments, called the `sender`. The `sender` argument gives context sensitive information on where the call originated from and can be used for simple request &lt;-> **reply** pairs, and for debugging purposes.

## `Client`
The set of all `Client` endpoint definition is automatically sent to the client and installed, as soon a client connects. On the client side, `this.Shared` and `this.Instance` refer to the same object, and `Private` and `Public` are both merged into the `Client` *component definition* itself. If you want to load components dynamically (or lazily), during certain events, you need to set the `lazyLoad` config parameter to `true` or `1`.

## `Base`
Everything from the `Base` definition is merged into both, `Host` and `Client`. `Public` and `Private` are also merged correspondingly. Since `Host` and `Client` operate slightly different, certain naming decisions had to be made seemingly in favor of one over the other. E.g. the `Shared` concept does not exist on client side (because a `Client` only contains a single instance of all components), so there, it simply is the same as `Instance`.
Inside `Base` members, you can call `this.someMethod` even if `someMethod` is not declared in `Base`, but instead is declared in `Host` as well as `Client`. At the same time, you can call `this.someBaseMethod` from each endpoint definition. That enables you to easily have shared code call endpoint-specific code and vice versa, thereby supporting polymorphism and encapsulation.


## Component Skeleton
<a name="component_skeleton"></a>
This skeleton code summarizes (most of) available component structure:


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

    /**
     * The `Host` definition is only executed on and visible to the server.
     */
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

    /**
     * The `Client` definition is automatically deployed to every connected client.
     */
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


Getting Started
=============
<a name="getting_started"></a>

This tutorial is aimed at those who are new to `NoGap`, and new to `Node` in general.
It should help you bridge the gap from the [Code Snippets](#samples) to a real-world application.
Note that the [Simple Sample App](https://github.com/Domiii/NoGap/tree/master/samples/sample_app) is also following these guidelines.

## Recommended File Structure
    .
    +-- components/
    | +-- models/
    | +-- ui/
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
 * `lazyLoad` (Default = true)
  * Wether you want to explicitly send each component's client side to clients when necessary.
 * `endpointImplementation` (set of options to configure the transport layer)
  * `name` (Default = `HttpPost`)
    * Currently, only POST is available. Websockets will follow soon.
    * You can also implement your own transport layer if you want, but you probably don't.
    * If you are interested into the dirty details, have a look at [`HttpPostImpl` in `ComponentCommunications.js`](https://github.com/Domiii/NoGap/blob/master/lib/ComponentCommunications.js#L564)
  * `traceKeepOpen` (Default = 0)
    * This is for debugging your `keepOpen` and `flush` pairs. If you don't pair them up correctly, the client might wait forever.
    * If your client does not receive any data, try setting this value to 4 and check if all calls pair up correctly.
    * The value determines how many lines of stacktrace to show, relative to the first non-internal call; that is the first stackframe whose code is not located in the NoGap folder.


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


Debuggability & security
=============
By default, each `Client` only receives code from `Client` and `Base` definitions. `Host`-only code is not available to the client. However, the names of absolute file paths are sent to the client to facilitate perfect debugging; i.e. all stacktraces and the debugger will refer to the correct line inside the actual host-resident component file. If that is of concern to you, let me know, and I'll move up TODO priority of name scrambling, or have a look at [`ComponentDef`'s `FactoryDef`, and the corresponding `def*` methods](https://github.com/Domiii/NoGap/blob/master/lib/ComponentDef.js#L71) yourself.


Important Terms
=============
TODO: Add more links + terms.

* Component
* Host
* Client
* Base (mergd into Client and Host)
* Instance (set of all component instance objects)
* Shared (set of all component shared objects)
* Endpoint (refers to Client or Host)
* Tools (set of functions to assist managing of components)
* Context
* Asset (an asset is content data, such as html and css code, images and more)
* more...


Final Words
=============

Good luck! In case of questions, feel free to contact me.
